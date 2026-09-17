import fs from "node:fs";
import path from "node:path";
import { countryNameToIsoCode } from "./countryCodes.js";

const CACHE_PATH = path.join(process.cwd(), "pipeline", "data", "geocode-cache.json");
// Nominatim's usage policy requires a real, working contact in the User-Agent
// for anyone running this pipeline — replace this placeholder with your own
// before running `npm run geocode` (see README.md).
const USER_AGENT = "TourhubInteractiveMap/0.1 (contact: your-email@example.com)";
const MIN_INTERVAL_MS = 1600; // comfortably under Nominatim's 1 req/sec ceiling
const MAX_RETRIES = 5;
const ABORT_AFTER_CONSECUTIVE_TRANSIENT_FAILURES = 3;

export class NominatimBlockedError extends Error {}

let cache = loadCache();
let lastRequestAt = 0;
let consecutiveTransientFailures = 0;

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveCache() {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function normalizeQuery(query) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

// Tourhub's own itinerary data frequently suffixes places with a UK
// constituent country ("..., Scotland", "..., England") rather than
// "..., United Kingdom" — but Nominatim's address.country for anywhere in
// the UK is always "United Kingdom", so these need to compare as equal.
const COUNTRY_NAME_ALIASES = {
  scotland: "united kingdom",
  england: "united kingdom",
  wales: "united kingdom",
  "northern ireland": "united kingdom",
  uk: "united kingdom",
};

function normalizeCountryName(name) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, "");
  return COUNTRY_NAME_ALIASES[base] ?? base;
}

// OSM categories that are never a sensible match for a day's place name —
// individual businesses/buildings, not geography.
const NON_PLACE_CATEGORIES = new Set(["shop", "office", "craft", "amenity"]);
// tourism=hotel/hostel/etc. matches a lodging business by name, not a place —
// unlike tourism=attraction/viewpoint/museum, which are legitimate landmarks.
const LODGING_TYPES = new Set(["hotel", "hostel", "guest_house", "motel", "apartment", "chalet"]);
const MIN_IMPORTANCE = 0.0003;

async function waitForRateLimit() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
}

// Rate-limit (429) and server (5xx) responses are transient — retry with
// backoff rather than treating them as a real answer for the query.
async function fetchWithRetry(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    lastRequestAt = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt === MAX_RETRIES) return res;

    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : null;
    const backoffMs = retryAfterMs ?? Math.min(30000, 2000 * 2 ** attempt);
    console.log(`  (Nominatim http ${res.status}, retrying in ${Math.round(backoffMs / 1000)}s...)`);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
}

/**
 * Geocode a free-text query via Nominatim, with a persistent on-disk cache
 * and a hard throttle on cache misses. Transient failures (rate limiting,
 * server errors) are never cached — only deterministic outcomes (a result,
 * "no results", or a country mismatch) are, so a future run naturally
 * retries anything that failed transiently.
 * @param {string} query
 * @param {{ acceptableCountries?: string[] }} [opts]
 */
export async function geocode(query, opts = {}) {
  const { acceptableCountries } = opts;

  // Bias the search itself with countrycodes (proper Nominatim param) rather
  // than embedding a country name in the query text — that way a
  // multi-country region (e.g. Egypt/Jordan) doesn't have to guess which one
  // to assert, and a globally-ambiguous name (e.g. "Glencoe" also exists in
  // the US) still resolves to the right one instead of the top global match.
  const isoCodes = [...new Set((acceptableCountries ?? []).map(countryNameToIsoCode).filter(Boolean))].sort();
  const countryParam = isoCodes.length ? `&countrycodes=${isoCodes.join(",")}` : "";

  // The country constraint changes what a query can resolve to (a bare
  // "London" is a different lookup when restricted to Peru vs the UK), so
  // it must be part of the cache key — otherwise whichever tour queries a
  // name first "poisons" the result for every other tour that queries the
  // same name under a different country constraint.
  const key = `${normalizeQuery(query)}|${isoCodes.join(",")}`;
  if (key in cache) return cache[key];

  await waitForRateLimit();

  // accept-language=en so address.country comes back in English ("Nepal", not "नेपाल")
  // and is comparable against our English-language acceptable-country lists.
  // limit=5 (not 1): the single top-ranked hit is sometimes a business that
  // happens to share the query's name (e.g. "Golden Circle" ranking an
  // apartment rental above the actual famous Icelandic sightseeing route) —
  // with only one candidate there's no way to fall through to a better one.
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&accept-language=en${countryParam}&q=${encodeURIComponent(query)}`;

  let result;
  let transient = false;
  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      transient = res.status === 429 || res.status >= 500;
      result = { failed: true, reason: `http ${res.status}` };
    } else {
      const data = await res.json();
      if (!data.length) {
        result = { failed: true, reason: "no results" };
      } else {
        const acceptable = acceptableCountries?.length
          ? acceptableCountries.map(normalizeCountryName)
          : null;
        let lastRejection = null;
        result = null;
        for (const hit of data) {
          const country = hit.address?.country ?? null;
          const isLodgingBusiness = hit.category === "tourism" && LODGING_TYPES.has(hit.type);
          if (NON_PLACE_CATEGORIES.has(hit.category) || isLodgingBusiness) {
            // A countrycodes-constrained search can still "succeed" by
            // matching an individual shop/hotel/office that happens to
            // share the query's name (e.g. "London" -> a Lima clothing shop
            // called "London House") rather than correctly finding no real
            // place — try the next candidate instead of failing outright.
            lastRejection = `low-quality match (category: ${hit.category}/${hit.type})`;
            continue;
          }
          if (hit.importance != null && hit.importance < MIN_IMPORTANCE) {
            // Catches the same problem more generally: a near-zero
            // importance score means Nominatim itself considers this an
            // obscure/trivial POI, not what the query actually meant.
            lastRejection = `low-quality match (importance ${hit.importance})`;
            continue;
          }
          // A missing country (continents, seas, "Asia", "Mediterranean
          // Sea") is rejected the same as a wrong one when we have specific
          // expectations — no real day-stop in any of our tours is a
          // borderless feature, so treat "no country" as "wrong place"
          // rather than "check not possible".
          if (acceptable && (!country || !acceptable.includes(normalizeCountryName(country)))) {
            lastRejection = `country mismatch: got "${country ?? "none"}", expected one of [${acceptableCountries.join(", ")}]`;
            continue;
          }
          result = {
            lat: parseFloat(hit.lat),
            lng: parseFloat(hit.lon),
            displayName: hit.display_name,
            country,
          };
          break;
        }
        if (!result) {
          result = { failed: true, reason: lastRejection ?? "no results" };
        }
      }
    }
  } catch (err) {
    transient = true; // network error — worth retrying on a future run
    result = { failed: true, reason: String(err) };
  }

  if (!transient) {
    cache[key] = result;
    saveCache();
    consecutiveTransientFailures = 0;
    return result;
  }

  consecutiveTransientFailures++;
  if (consecutiveTransientFailures >= ABORT_AFTER_CONSECUTIVE_TRANSIENT_FAILURES) {
    throw new NominatimBlockedError(
      `Nominatim has returned transient failures for ${consecutiveTransientFailures} queries in a row even after per-query retries — this looks like a sustained rate limit or IP block, not a blip. Aborting rather than hammering the service further. Wait a while (Nominatim's usage policy suggests this can take up to an hour to clear) and re-run — already-resolved places are cached, so it'll pick up where it left off.`
    );
  }
  return result;
}
