import fs from "node:fs";
import path from "node:path";
import { geocode, NominatimBlockedError } from "./lib/nominatim.js";
import { REGION_COUNTRY_ALIASES } from "./lib/regionCountries.js";
import { KNOWN_COUNTRY_NAMES } from "./lib/countryCodes.js";

const ROOT = process.cwd();
const IN_FILE = path.join(ROOT, "pipeline", "data", "tours-raw.json");
const OUT_FILE = path.join(ROOT, "pipeline", "data", "tours.json");
// The frontend (Vite dev server and the Express static server) both serve
// straight out of public/, so the pipeline's output is mirrored there too.
const PUBLIC_OUT_FILE = path.join(ROOT, "public", "tours.json");

function acceptableCountriesFor(tour) {
  if (tour.acceptableCountries?.length) return tour.acceptableCountries;
  return REGION_COUNTRY_ALIASES[tour.region] ?? (tour.region ? [tour.region] : []);
}

function computeCentroid(days) {
  const resolved = days.map((d) => d.location).filter(Boolean);
  if (!resolved.length) return null;
  const lat = resolved.reduce((sum, l) => sum + l.lat, 0) / resolved.length;
  const lng = resolved.reduce((sum, l) => sum + l.lng, 0) / resolved.length;
  return { lat, lng };
}

async function geocodeTour(tour, stats) {
  const acceptableCountries = acceptableCountriesFor(tour);

  const days = [];
  let lastResolvedLocation = null;
  for (const day of tour.days) {
    const candidates = day.rawLocationCandidates ?? [];
    if (!candidates.length) {
      // No place-name signal at all for this day (title/structured span/prose
      // all came up empty) — most often a day that continues at the same
      // place as the previous one, so carry that location forward rather
      // than leaving a gap in the route line.
      days.push({
        dayNumber: day.dayNumber,
        title: day.title,
        description: day.description,
        location: lastResolvedLocation,
      });
      stats.daysSkippedNoCandidate++;
      continue;
    }

    // Try each candidate in order (title first, then structured span, then
    // prose-mentioned places) until one actually geocodes — the top-ranked
    // candidate can genuinely name a real place that just has no single map
    // point (e.g. "Golden Circle", a touring route, not a point), in which
    // case a more specific place mentioned in the day's own description is
    // still worth trying before giving up.
    let resolved = null;
    let countryLevelFallback = null;
    let failureReasons = [];
    for (const query of candidates) {
      const result = await geocode(query, { acceptableCountries });
      if (result.failed) {
        failureReasons.push(`"${query}" — ${result.reason}`);
        continue;
      }
      // A bare country name ("Iceland") geocodes "successfully" but to a
      // near-useless whole-country centroid — keep trying other candidates
      // for something more specific, only falling back to it if nothing
      // better turns up anywhere in the list.
      if (KNOWN_COUNTRY_NAMES.has(query.toLowerCase())) {
        countryLevelFallback = countryLevelFallback ?? { name: query, lat: result.lat, lng: result.lng };
        continue;
      }
      resolved = { name: query, lat: result.lat, lng: result.lng };
      break;
    }
    resolved = resolved ?? countryLevelFallback;

    if (!resolved) {
      console.log(`  day ${day.dayNumber} (${tour.id}): FAILED ${failureReasons.join("; ")}`);
      days.push({ dayNumber: day.dayNumber, title: day.title, description: day.description, location: null });
      stats.daysFailed++;
    } else {
      lastResolvedLocation = resolved;
      days.push({
        dayNumber: day.dayNumber,
        title: day.title,
        description: day.description,
        location: resolved,
      });
      stats.daysResolved++;
    }
  }

  const centroid = computeCentroid(days);

  return {
    id: tour.id,
    title: tour.title,
    operator: tour.operator,
    region: tour.region,
    sourceUrl: tour.sourceUrl,
    shortDescription: tour.shortDescription,
    vibe: tour.shortDescription,
    price: tour.price,
    durationDays: tour.durationDays,
    centroid,
    days,
  };
}

async function main() {
  const toursRaw = JSON.parse(fs.readFileSync(IN_FILE, "utf-8"));
  console.log(`Geocoding ${toursRaw.length} tours (cache-backed, ~1 req/sec on misses)...`);

  const stats = { daysResolved: 0, daysFailed: 0, daysSkippedNoCandidate: 0 };
  const tours = [];
  const droppedTours = [];
  let blockedEarly = null;

  for (const [index, tour] of toursRaw.entries()) {
    console.log(`[${index + 1}/${toursRaw.length}] ${tour.id}`);
    try {
      const geocoded = await geocodeTour(tour, stats);
      if (!geocoded.centroid) {
        droppedTours.push(tour.id);
        console.log(`  DROPPED: no day resolved to a location`);
        continue;
      }
      tours.push(geocoded);
    } catch (err) {
      if (err instanceof NominatimBlockedError) {
        blockedEarly = err;
        break;
      }
      throw err;
    }
  }

  // Merge onto any previous output rather than overwrite it, so a run that
  // gets cut short (e.g. by a Nominatim block) never regresses tours a
  // prior run already resolved successfully — it can only add/update.
  let previousTours = [];
  try {
    previousTours = JSON.parse(fs.readFileSync(OUT_FILE, "utf-8"));
  } catch {
    // no previous output yet — fine.
  }
  const merged = new Map(previousTours.map((t) => [t.id, t]));
  for (const t of tours) merged.set(t.id, t);
  const finalTours = [...merged.values()];

  const json = JSON.stringify(finalTours, null, 2);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, json, "utf-8");
  fs.mkdirSync(path.dirname(PUBLIC_OUT_FILE), { recursive: true });
  fs.writeFileSync(PUBLIC_OUT_FILE, json, "utf-8");

  console.log(
    `\nWrote ${finalTours.length} tours (${tours.length} from this run) to ${path.relative(ROOT, OUT_FILE)} and ${path.relative(ROOT, PUBLIC_OUT_FILE)}.`
  );
  console.log(
    `Days resolved: ${stats.daysResolved}, failed: ${stats.daysFailed}, no candidate: ${stats.daysSkippedNoCandidate}.`
  );
  if (blockedEarly) {
    console.log(`\n${blockedEarly.message}`);
  }
  if (droppedTours.length) {
    console.log(`Dropped ${droppedTours.length} tour(s) with zero resolvable days: ${droppedTours.join(", ")}`);
  }
}

main();
