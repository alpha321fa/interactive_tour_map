import * as cheerio from "cheerio";
import { extractTitlePlace, extractProseCandidates, isPlausiblePlaceName } from "./extractPlaceCandidates.js";

function repairTrailingCommas(raw) {
  // Some operator templates emit a dangling comma before a closing ] or }
  // (e.g. an empty itinerary array), which is invalid JSON.
  return raw.replace(/,(\s*[}\]])/g, "$1");
}

function extractJsonLdNodes(html) {
  const $ = cheerio.load(html);
  const nodes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        parsed = JSON.parse(repairTrailingCommas(raw));
      } catch {
        return; // still malformed — skip this block, others may be usable.
      }
    }
    if (Array.isArray(parsed["@graph"])) {
      nodes.push(...parsed["@graph"]);
    } else {
      nodes.push(parsed);
    }
  });
  return nodes;
}

function findTripNode(nodes) {
  return nodes.find((node) => {
    const type = node["@type"];
    const types = Array.isArray(type) ? type : [type];
    return types.includes("Trip") || types.includes("TouristTrip") || types.includes("Product");
  });
}

function findFirstKey(obj, key, seen = new Set()) {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return undefined;
  seen.add(obj);
  if (key in obj) return obj[key];
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findFirstKey(value, key, seen);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function parseDurationDays(tripNode) {
  const iso = findFirstKey(tripNode, "duration");
  if (typeof iso === "string") {
    const match = iso.match(/^P(\d+)D$/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function parsePrice(tripNode) {
  const offers = tripNode.offers;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (!offer?.price) return null;
  const amount = parseFloat(offer.price);
  if (Number.isNaN(amount)) return null;
  return { amount, currency: offer.priceCurrency ?? null };
}

function extractOgImage($) {
  const content = $('meta[property="og:image"]').attr("content");
  return content ? content.trim() : null;
}

function parseItineraryPlaces(tripNode) {
  const itinerary = Array.isArray(tripNode.itinerary) ? tripNode.itinerary : [];
  return itinerary
    .map((place) => place?.name)
    .filter((name) => typeof name === "string" && !/tour map$/i.test(name.trim()));
}

function deriveAcceptableCountries(itineraryPlaceNames) {
  const countries = new Set();
  for (const name of itineraryPlaceNames) {
    const lastComma = name.lastIndexOf(",");
    if (lastComma !== -1) {
      // Trailing punctuation ("Cambodia.") would otherwise fail to match
      // the known-country lookup, silently dropping the country constraint.
      const country = name.slice(lastComma + 1).trim().replace(/[.,;!?]+$/, "");
      if (country) countries.add(country);
    }
  }
  return [...countries];
}

// A few operators' titles arrive double-escaped in the page source, so
// cheerio's .text() sees literal tag-like text ("<STRONG>Day 1: ...
// </STRONG>") instead of real markup it would otherwise strip.
function stripLiteralTags(text) {
  return text.replace(/<\/?[A-Za-z][A-Za-z0-9]*>/g, "").trim();
}

function parseItineraryDays(html, $) {
  const days = [];
  // Some operators title a rest/buffer day just "Day at leisure" with no
  // digit at all (e.g. a jet-lag day the day after a long-haul flight) —
  // rather than dropping the item entirely, infer its number from its
  // position in the sequence, continuing on from the last explicit number seen.
  let expectedDayNumber = 1;
  $(".tour__itinerary-item").each((_, el) => {
    const titleRaw = stripLiteralTags(
      $(el).find(".tour__itinerary-item-title-words h3").first().text().trim()
    );
    const dayMatch = titleRaw.match(/Day\s*(\d+)/i);
    const dayNumber = dayMatch ? parseInt(dayMatch[1], 10) : expectedDayNumber;
    expectedDayNumber = dayNumber + 1;

    const description = stripLiteralTags(
      $(el)
        .find(".tour__itinerary-item-content-words")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim()
    );

    // Ranked candidates, most-confident first: the title usually names the
    // day's actual place, but it can also name something real yet
    // ungeocodable (e.g. "Golden Circle" is a genuine Icelandic touring
    // route with no single map point) — in that case the geocoder falls
    // through to try the next candidate rather than giving up outright.
    const candidates = [];
    const addCandidate = (value) => {
      if (!value) return;
      if (candidates.some((c) => c.toLowerCase() === value.toLowerCase())) return;
      candidates.push(value);
    };

    addCandidate(extractTitlePlace(titleRaw));

    const locationSpan = $(`#itinerary-day-${dayNumber}-location`).first().text().trim();
    if (locationSpan) {
      const parts = locationSpan.split(",").map((s) => s.trim()).filter(Boolean);
      const candidate = parts[parts.length - 1] ?? null;
      if (candidate && isPlausiblePlaceName(candidate)) addCandidate(candidate);
    }

    for (const candidate of extractProseCandidates(description)) addCandidate(candidate);

    // Some operators' itinerary blocks include a photo carousel (real
    // location photos, not stock/marketing images) — take the first slide
    // as this day's illustrative image, when present.
    const imgEl = $(el).find(".tour__itinerary-item-content-images img").first();
    const image = imgEl.length
      ? { url: imgEl.attr("src"), alt: imgEl.attr("alt")?.trim() || null }
      : null;

    const previous = days[days.length - 1];
    const isExactRepeat =
      previous && previous.dayNumber === dayNumber && previous.title === titleRaw && previous.description === description;
    if (isExactRepeat) return; // a few operator pages genuinely duplicate a whole day block verbatim

    days.push({
      dayNumber,
      title: titleRaw,
      description,
      rawLocationCandidates: candidates,
      image,
    });
  });
  days.sort((a, b) => a.dayNumber - b.dayNumber);
  return days;
}

/**
 * Parse a single tourhub.co tour page's HTML into a raw (pre-geocoding) tour record.
 */
export function parseTourPage(html, { url, region, id }) {
  const $ = cheerio.load(html);
  const jsonLdNodes = extractJsonLdNodes(html);
  const tripNode = findTripNode(jsonLdNodes);

  if (!tripNode) {
    throw new Error("no Trip/Product JSON-LD node found on page");
  }

  const itineraryPlaceNames = parseItineraryPlaces(tripNode);
  const days = parseItineraryDays(html, $);

  return {
    id,
    title: tripNode.name ?? null,
    operator: tripNode.provider?.name ?? null,
    region,
    sourceUrl: url,
    shortDescription: tripNode.description ?? null,
    image: extractOgImage($),
    price: parsePrice(tripNode),
    durationDays: parseDurationDays(tripNode) ?? days.length,
    acceptableCountries: deriveAcceptableCountries(itineraryPlaceNames),
    days,
  };
}
