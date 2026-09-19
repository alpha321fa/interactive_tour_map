import fs from "node:fs";
import path from "node:path";

const CACHE_PATH = path.join(process.cwd(), "pipeline", "data", "wikimedia-cache.json");
// Wikimedia's API etiquette also asks for a descriptive contact User-Agent —
// same placeholder-and-replace-it approach as nominatim.js (see README.md).
const USER_AGENT = "TourhubInteractiveMap/0.1 (contact: your-email@example.com)";
const MIN_INTERVAL_MS = 1000;
const GEOSEARCH_RADIUS_M = 10000; // generous enough to find a notable nearby landmark/settlement
const GEOSEARCH_LIMIT = 8; // fetch several candidates so a map/flag/diagram hit can fall through to the next-nearest real photo

let cache = loadCache();
let lastRequestAt = 0;

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

async function waitForRateLimit() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// A Wikipedia article's "page image" is often its infobox image, which for a
// less-photographed place is just as likely to be a locator map, a flag, a
// coat of arms, or some other diagram as an actual photo — none of which are
// "an image of the place" in the sense the map's day-pin popup needs. Reject
// those by filename rather than trust whatever the API hands back. Commons
// files also frequently keep the original (non-English) uploader's filename
// for old map scans, hence the non-English "map" words below (the actual bug
// this was written for: Nepal's "Khumbu" article's page image is
// "KarteKhumbu.jpg" — German "Karte" = map).
const NON_PHOTO_KEYWORDS = [
  "map",
  "karte",
  "carte",
  "mapa",
  "kaart",
  "mappa",
  "topograph",
  "relief",
  "locator",
  "route",
  "diagram",
  "schematic",
  "chart",
  "profile",
  "flag_of",
  "flag of",
  "coat_of_arms",
  "coat of arms",
  "seal_of",
  "seal of",
  "emblem",
  "logo",
  "crest",
  "insignia",
  "wiki_letter",
  "question_book",
  "crystal_clear",
  "nuvola",
  "ambox",
  "commons-logo",
  "wikimedia-logo",
];

function looksLikeNonPhoto(thumbnailUrl) {
  if (/\.svg(\?|$)/i.test(thumbnailUrl)) return true; // vector graphics are essentially always diagrams/maps/flags/logos, never photos
  const decoded = decodeURIComponent(thumbnailUrl).toLowerCase();
  return NON_PHOTO_KEYWORDS.some((kw) => decoded.includes(kw));
}

/**
 * Find the nearest Wikipedia article with geo-coordinates near (lat, lng)
 * that has an actual photo (not a map/flag/diagram) as its page image, and
 * return that photo, for use as a generic "photo of this place" when
 * tourhub itself didn't provide a day photo. Persistent on-disk cache, same
 * rationale as nominatim.js's geocode cache.
 * @param {number} lat
 * @param {number} lng
 */
export async function getLocationImage(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (key in cache) return cache[key];

  await waitForRateLimit();

  // `generator=geosearch` merges results into `query.pages` keyed by
  // pageid, which discards the original nearest-first ordering (and a plain
  // JS object with numeric-looking keys reorders them ascending by pageid,
  // not distance) — so `coordinates` is requested too and distance is
  // recomputed and sorted client-side rather than trusted from response order.
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&generator=geosearch` +
    `&ggscoord=${lat}|${lng}&ggsradius=${GEOSEARCH_RADIUS_M}&ggslimit=${GEOSEARCH_LIMIT}` +
    `&prop=pageimages|info|coordinates&piprop=thumbnail&pithumbsize=480&inprop=url&format=json`;

  let result;
  try {
    lastRequestAt = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      result = { failed: true, reason: `http ${res.status}` };
    } else {
      const data = await res.json();
      const pages = Object.values(data.query?.pages ?? {})
        .filter((p) => p.coordinates?.[0])
        .map((p) => ({
          ...p,
          distance: haversineMeters(lat, lng, p.coordinates[0].lat, p.coordinates[0].lon),
        }))
        .sort((a, b) => a.distance - b.distance);

      const photo = pages.find((p) => p.thumbnail?.source && !looksLikeNonPhoto(p.thumbnail.source));
      if (!photo) {
        result = { failed: true, reason: "no nearby article with an actual photo (only maps/diagrams/no image)" };
      } else {
        result = { url: photo.thumbnail.source, alt: photo.title, pageUrl: photo.fullurl ?? null };
      }
    }
  } catch (err) {
    result = { failed: true, reason: String(err) };
  }

  cache[key] = result;
  saveCache();
  return result;
}
