# Tourhub Interactive Map

An interactive map showcasing real multi-day tours scraped from
[tourhub.co](https://tourhub.co). Every tour appears as a clustered pin on a
world map; clicking one zooms into a focused view with a pin for each day of
the itinerary, connected by a route line, alongside the day-by-day
description.

- **Overview**: all tours plotted and clustered, so the map isn't cluttered
  at world zoom. Clusters split apart as you zoom in.
- **Focused view**: click a pin to fly into that tour's region, see a
  numbered pin per day (days at the same location merge into one pin, e.g.
  "1-2"), and read the itinerary in a side panel. The URL updates
  (`/tour/:id`) so a focused view is shareable and works with the browser
  back button.
- **Surprise me**: jump to a random tour.
- **Home**: reset the map to the world view from anywhere.
- **Day photos**: click a day pin to see a photo of that specific place and
  scroll the side panel to the matching entry — Tourhub's own itinerary photo
  when one was scraped, otherwise a real Wikipedia photo of that exact
  location (credited in-app), rather than no image or the tour's generic
  cover photo.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173, hot-reload dev server
```

or, closer to how it'd actually deploy:

```bash
npm install
npm run build      # bundles the app into dist/
npm run serve      # Express server on http://localhost:3000
```

The tour data is already built and committed (`public/tours.json` /
`pipeline/data/tours.json`), so running the app doesn't require re-running
the scraper or geocoder.

## How the data pipeline works

The dataset is produced by a two-stage offline pipeline (`pipeline/`), not at
runtime:

1. **`npm run scrape`** — fetches each tour URL listed in `urls.txt`, and
   parses its JSON-LD and itinerary markup into a ranked list of place-name
   candidates per day (title text, Tourhub's own structured location data
   where present, and named places mentioned in the day's own description).
   Real operator pages are messy — the parser specifically works around
   things like marketing copy in day titles, meal-plan codes in parentheses,
   double-escaped HTML, missing day numbers, and duplicated content blocks.
   Raw HTML is cached to `pipeline/data/raw-html/` (gitignored) so re-running
   the parser during development doesn't re-hit tourhub.co.

2. **`npm run geocode`** — resolves each day's place-name candidates to real
   coordinates via [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap's
   free geocoder), trying each candidate in order until one resolves to a
   real, verified place (rejecting businesses/POIs and low-confidence
   matches, and requiring the result to be in a country the tour actually
   visits). Results are cached to `pipeline/data/geocode-cache.json`
   (committed, so a fresh clone never needs to re-geocode), and the pipeline
   respects Nominatim's ~1 request/second usage limit. For any day that
   resolves to a location but has no photo scraped from Tourhub's own
   itinerary markup, this stage also looks up a real photo of that exact
   point via Wikipedia's geosearch API (nearest geo-tagged article's page
   image), cached to `pipeline/data/wikimedia-cache.json`.

**Before running `npm run geocode`**, open `pipeline/lib/nominatim.js` *and*
`pipeline/lib/wikimedia.js` and replace the placeholder contact email in each
file's `USER_AGENT` with your own — this is required by [Nominatim's usage
policy](https://operations.osmfoundation.org/policies/nominatim/) and
requested by [Wikimedia's API
etiquette](https://meta.wikimedia.org/wiki/User-Agent_policy), not optional.

Both scripts are safe to re-run: they only fetch/geocode what isn't already
cached, so iterating on the parsing logic doesn't mean re-scraping or
re-geocoding everything from scratch.

## Tech stack

- **Frontend**: Vite + React, [react-leaflet](https://react-leaflet.js.org/)
  for the map, `react-leaflet-cluster` for pin clustering, React Router for
  shareable per-tour URLs.
- **Map tiles**: standard OpenStreetMap tiles (free, no API key).
- **Server**: a small Express app that just serves the built frontend and
  the static `tours.json` — no dynamic API yet.
- **Pipeline**: plain Node.js scripts (Cheerio for HTML parsing, Nominatim
  for geocoding, Wikipedia's API for fallback day photos).

## Data sourcing & attribution

- Tour listings are scraped from [tourhub.co](https://tourhub.co) for this
  showcase project. `urls.txt` lists the source tours.
- Map tiles: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Geocoding: © [Nominatim](https://nominatim.openstreetmap.org/) / OpenStreetMap contributors.
- Fallback day photos (used when Tourhub's own itinerary page had none):
  Wikipedia / Wikimedia Commons, credited with a link to the source article
  directly on the photo popup.

## Known limitations

- ~99% of scraped tour days resolve to a verified location; the rest
  gracefully carry forward the previous day's pin rather than showing a gap
  or a wrong location.
- Desktop-first layout; no mobile-specific design yet.
- No search/filter UI — browsing is by map only, by design for this version.
- Duplicate/near-duplicate tours from the same operator are shown as
  separate pins (they're genuinely different bookable products).
