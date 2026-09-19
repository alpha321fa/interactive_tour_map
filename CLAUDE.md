# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev       # Vite dev server, http://localhost:5173
npm run build     # bundle frontend into dist/
npm run preview   # preview the production build
npm run serve     # Express server on http://localhost:3000 (serves dist/ + tours.json; run build first)
npm run scrape    # pipeline stage 1: scrape tourhub.co -> pipeline/data/tours-raw.json
npm run geocode   # pipeline stage 2: geocode tours-raw.json -> pipeline/data/tours.json + public/tours.json
```

There is no lint config and no test suite in this repo.

Before running `npm run geocode` for real (not just reading the code), open
`pipeline/lib/nominatim.js` and replace the placeholder contact email in
`USER_AGENT` — Nominatim's usage policy requires a real one.

Both pipeline scripts are cache-backed and safe to re-run repeatedly:
`scrape.js` caches raw HTML per URL under `pipeline/data/raw-html/`
(gitignored) so re-parsing doesn't re-hit tourhub.co, and `geocode.js` caches
resolved queries in `pipeline/data/geocode-cache.json` (committed) so
re-running only pays for genuinely new queries. When iterating on extraction
or geocoding logic, the normal loop is: edit code → `npm run scrape` (fast,
cached) → inspect `pipeline/data/tours-raw.json` → `npm run geocode` (cache
means most queries are free) → inspect `pipeline/data/tours.json`.

To force a clean re-geocode after a logic change that could invalidate old
cached results, delete the failed-only entries rather than the whole cache:

```js
const cache = JSON.parse(fs.readFileSync('pipeline/data/geocode-cache.json', 'utf-8'));
for (const [k, v] of Object.entries(cache)) if (v.failed) delete cache[k];
fs.writeFileSync('pipeline/data/geocode-cache.json', JSON.stringify(cache, null, 2));
```

Successful-but-wrong entries (a bad match that didn't get flagged as
`failed`) won't be caught by this — if a heuristic change should invalidate
those too, wipe the whole cache (`echo "{}" > pipeline/data/geocode-cache.json`)
and re-run, at the cost of a full re-geocode.

## Architecture

Two independent halves: an offline data pipeline (`pipeline/`) that produces
`public/tours.json`, and a frontend (`src/`) that reads it. The pipeline is
never invoked at runtime — the frontend just fetches a static JSON file.

### Data pipeline (`pipeline/`)

**`scrape.js`** reads `urls.txt` (URLs grouped under `# Region` comment
headers, which become each tour's `region` field) and fetches each tourhub.co
page with a browser-style User-Agent (tourhub.co blocks an honest bot
User-Agent, unlike Nominatim, which requires one — the two scripts
deliberately use different UAs for this reason). For each day of the
itinerary, `parseTourPage.js` builds an ordered, deduplicated list of place
candidates — `day.rawLocationCandidates` — from three sources in priority
order:
1. the day title, via `extractPlaceCandidates.js`'s `extractTitlePlace`
2. Tourhub's own structured `id="itinerary-day-N-location"` span, when present
3. every plausible place mentioned in the day's own prose description, via
   `extractProseCandidates` (this exists because a title candidate can name
   something real but ungeocodable, e.g. "Golden Circle" is a genuine
   touring route with no single map point — the day's prose usually
   mentions specific stops that do resolve)

`extractPlaceCandidates.js` is the trickiest file in the codebase: it exists
to handle a long tail of real operator formatting quirks discovered by
trial and error against actual tourhub.co pages — marketing adjectives
("Beautiful Edinburgh"), meal-plan codes in parens ("(B/L/D)"), redundant
trailing country tags ("Tarangire National Park – Tanzania"), "Nickname of
RealPlace" constructions, double-escaped HTML on some operators' pages, day
titles with no digit at all, and duplicate day blocks. If a tour's map looks
wrong, the bug is almost always here or in the geocoding quality filters
below, not in the frontend. `regionCountries.js` and `countryCodes.js` back
this — `REGION_COUNTRY_ALIASES` maps each `urls.txt` region label to its
plausible countries (some regions legitimately span several, e.g.
"Vietnam / Cambodia / Thailand"), and country names are normalized so
Tourhub's use of "Scotland"/"England" as if they were countries matches
Nominatim's "United Kingdom".

**`geocode.js`** walks each day's `rawLocationCandidates` in order via
`nominatim.js`'s `geocode()`, trying candidates until one resolves —
falling through to the next candidate rather than failing outright. A
resolved bare country name (e.g. "Iceland") is deliberately deferred rather
than accepted immediately, since a country centroid is technically valid but
much less useful than a more specific candidate later in the list.
`nominatim.js` biases the search with Nominatim's `countrycodes` param
(derived from the tour's `acceptableCountries`, not embedded in the query
text — embedding a guessed country in the query text previously caused a
real place in the wrong assumed country to fail entirely), and rejects
low-quality matches: businesses/POIs (`NON_PLACE_CATEGORIES`, `LODGING_TYPES`),
near-zero-importance results, and country mismatches (including a *missing*
country, e.g. a continent or sea, which is always rejected when we have
specific expectations). The geocode cache key includes the country
constraint, not just the query text — the same place name can mean different
things in different countries, so caching by text alone previously let one
tour's wrong match poison every other tour's identical-looking query.

A day whose candidates all fail to geocode carries forward the previous
resolved day's location rather than leaving a gap (`lastResolvedLocation` in
`geocodeTour`). Output is merged with any previous `tours.json` rather than
overwritten outright, so an interrupted run (e.g. hitting Nominatim's rate
limit — `NominatimBlockedError` aborts cleanly after 3 consecutive transient
failures) never regresses previously-good data — though this means a
deliberate quality-logic improvement needs a cache purge (see Commands
above) to actually take effect, since the merge would otherwise preserve the
stale-but-not-technically-"failed" old result.

### Frontend (`src/`)

`App.jsx`'s `MapPage` renders for both `/` and `/tour/:id` — the same
component instance for both routes, so `MapView`'s Leaflet map never
unmounts when navigating into or out of a tour (only its focused-vs-overview
rendering changes). Two pieces of navigation state live in `MapPage`, not in
the router:
- `overviewView` — the map's pan/zoom position, captured continuously by
  `OverviewPositionTracker` (inside `MapView.jsx`) while the overview is
  showing. Closing a tour restores this instead of resetting to the world
  view. Cleared only by the Home button.
- `resetSignal` — a counter bumped only by the Home button, needed because
  `FlyToBounds`'s fly-triggering effect deliberately does *not* depend on
  `fallbackCenter`/`fallbackZoom` (which change continuously via the tracker
  above) — only on the `points` transition or this explicit signal. If it
  depended on the continuously-updating fallback position, panning the
  overview would fight the user's own drag.

In `MapView.jsx`, a focused tour's days are passed through
`filterOutlierDays.js` before rendering — a statistical filter (median
distance-to-center, both an absolute and a relative-to-the-tour's-own-spread
threshold) that drops a day whose location is a wild geographic outlier
relative to the rest of that tour (typically a "fly home" day to an unrelated
country) from the plotted route and bounds-fit, without touching the
underlying data or the side panel's day-by-day text. Separately,
`groupDaysByLocation.js` merges consecutive/repeated days at the same
coordinates into one pin with a combined label (e.g. "1-2"), so two nights
in one city don't render as stacked identical markers.

All map pins are CSS-styled `L.divIcon`s (`lib/mapIcons.js`), not Leaflet's
default marker images — the default marker PNGs don't resolve correctly
under Vite's bundler.
