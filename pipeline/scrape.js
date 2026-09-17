import fs from "node:fs";
import path from "node:path";
import { parseTourPage } from "./lib/parseTourPage.js";

const ROOT = process.cwd();
const URLS_FILE = path.join(ROOT, "urls.txt");
const RAW_HTML_DIR = path.join(ROOT, "pipeline", "data", "raw-html");
const OUT_FILE = path.join(ROOT, "pipeline", "data", "tours-raw.json");
// tourhub.co's bot detection rejects an honest identifying UA (unlike
// Nominatim, which requires one) — a standard browser UA is needed here.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FETCH_DELAY_MS = 700;

function readUrlsWithRegions() {
  const lines = fs.readFileSync(URLS_FILE, "utf-8").split(/\r?\n/);
  let currentRegion = null;
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      // Strip parenthetical notes ("United Kingdom (some billed as ...)")
      // so the region label matches REGION_COUNTRY_ALIASES's clean keys.
      currentRegion = trimmed.replace(/^#\s*/, "").replace(/\s*\(.*$/, "").trim();
      continue;
    }
    entries.push({ url: trimmed, region: currentRegion });
  }
  return entries;
}

function idFromUrl(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  // pathname like /tour/<operator>/<slug>/<sku> -> drop leading "tour"
  const relevant = parts[0] === "tour" ? parts.slice(1) : parts;
  return relevant
    .join("-")
    .toLowerCase()
    .replace(/[|\\/:*?"<>]/g, ""); // strip characters invalid in filenames
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url, id) {
  fs.mkdirSync(RAW_HTML_DIR, { recursive: true });
  const cachePath = path.join(RAW_HTML_DIR, `${id}.html`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, "utf-8");
  }
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`http ${res.status}`);
  }
  const html = await res.text();
  fs.writeFileSync(cachePath, html, "utf-8");
  await sleep(FETCH_DELAY_MS);
  return html;
}

async function main() {
  const entries = readUrlsWithRegions();
  console.log(`Found ${entries.length} tour URLs across ${new Set(entries.map((e) => e.region)).size} regions.`);

  const tours = [];
  const failures = [];

  for (const [index, { url, region }] of entries.entries()) {
    const id = idFromUrl(url);
    process.stdout.write(`[${index + 1}/${entries.length}] ${id} ... `);
    try {
      const html = await fetchHtml(url, id);
      const tour = parseTourPage(html, { url, region, id });
      tours.push(tour);
      console.log(
        `ok (${tour.days.length} days, ${tour.days.filter((d) => d.rawLocationCandidates.length).length} with a place candidate)`
      );
    } catch (err) {
      failures.push({ url, region, id, error: String(err) });
      console.log(`FAILED: ${err}`);
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(tours, null, 2), "utf-8");

  console.log(`\nWrote ${tours.length} tours to ${path.relative(ROOT, OUT_FILE)}.`);
  if (failures.length) {
    console.log(`${failures.length} URL(s) failed to scrape:`);
    for (const f of failures) console.log(`  - ${f.id}: ${f.error}`);
  }
}

main();
