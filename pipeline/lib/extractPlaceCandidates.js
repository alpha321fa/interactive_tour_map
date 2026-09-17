import { KNOWN_COUNTRY_NAMES } from "./countryCodes.js";

// Whole-segment exact matches: when the segment right before a transition
// split ("Fly to Cuzco...") is just this filler verb, the segment AFTER the
// split is the real destination, not necessarily the last one in the title.
const FILLER_SEGMENT_WORDS = new Set([
  "fly",
  "flight",
  "train",
  "drive",
  "transfer",
  "continue",
  "travel",
  "depart",
  "departure",
  "arrive",
  "arrival",
  "welcome",
]);

// Cut everything from the first match onward — operator titles frequently
// tack on ride/marketing/logistics metadata after the real place name, e.g.
// "Namche Bazaar Duration: 5-6 hours." or "Cusco Relaxed Start", and since
// these suffixes are themselves capitalized they'd otherwise get swept into
// the extracted place name.
const TRAILING_CUT_PATTERNS = [
  /\s+duration\b.*$/i,
  /\s+distance\b.*$/i,
  /\s+altitude\b.*$/i,
  /\s+elevation\b.*$/i,
  /\s+\d[\d,]*\s*(?:m|km|hours?|hrs?)\b.*$/i,
  /\s+relaxed\s+start\b.*$/i,
  /\s+sightseeing\s+tour\b.*$/i,
  /\s+city\s+tour\b.*$/i,
  /\s+at\s+leisure\b.*$/i,
  /\s+experience\b.*$/i,
  /\s+adventure\b.*$/i,
  /\s+discovery\b.*$/i,
  /\s+highlights\b.*$/i,
  /\s+journey\b.*$/i,
];

// Whole-run exact matches (case-insensitive): generic day-structure words
// that are capitalized in titles but are never themselves a place. A
// multi-word run like "Everest View" is unaffected since the stopword check
// only rejects when the ENTIRE candidate run matches one of these. Includes
// every FILLER_SEGMENT_WORDS entry too, so e.g. "Fly" can't slip through as
// a standalone "place" when a fallback segment happens to just be that verb.
const STOPWORDS = new Set([
  ...FILLER_SEGMENT_WORDS,
  "today",
  "day",
  "days",
  "morning",
  "afternoon",
  "evening",
  "breakfast",
  "lunch",
  "dinner",
  "hotel",
  "included",
  "overnight",
  "leisure",
  "relaxed",
  "start",
  "free",
  "optional",
  "second",
  "activity",
  "tour",
  "visit",
  "visiting",
  "explore",
  "exploring",
  "excursion",
  "sightseeing",
  "culture",
  "capital",
  "the",
  "a",
  "beautiful",
  "poetic",
  "vibrant",
  "majestic",
  "regal",
  "truly",
  "romantic",
  "stunning",
  "spectacular",
  "charming",
  "magical",
  "mystical",
  "enchanting",
  "amazing",
  "incredible",
  "picturesque",
  "idyllic",
  "breathtaking",
  "unforgettable",
  "wonderful",
  // Common words that are only capitalized because they open a sentence in
  // prose (not because they're a proper noun) — matters once prose is
  // scanned for fallback place candidates, not just short titles.
  "some",
  "you",
  "your",
  "to",
  "depending",
  "late",
  "we",
  "firstly",
  "next",
  "then",
  "here",
  "there",
  "this",
  "these",
  "those",
  "after",
  "before",
  "during",
  "while",
  "our",
  "if",
  "once",
  "as",
  "on",
  // Demonyms/nationality adjectives ("Icelandic horses", "Moroccan tea") —
  // real words, capitalized, but never themselves a place.
  "icelandic",
  "scottish",
  "english",
  "welsh",
  "irish",
  "british",
  "nepali",
  "nepalese",
  "peruvian",
  "moroccan",
  "egyptian",
  "jordanian",
  "israeli",
  "palestinian",
  "tanzanian",
  "japanese",
  "vietnamese",
  "cambodian",
  "thai",
  "laotian",
  // Common imperative/verb that starts sentences in prose ("See the...").
  "see",
  // Continents/oceans are never a single tour day's actual stop.
  "asia",
  "africa",
  "europe",
  "america",
  "antarctica",
  "oceania",
]);

export function isPlausiblePlaceName(text) {
  if (!text || text.length < 2 || text.length > 60) return false;
  const lower = text.toLowerCase();
  if (STOPWORDS.has(lower)) return false;
  // Rejects meal-plan codes some operators put in parentheses right after a
  // day's real place list, e.g. "(B/-/-)" or "(B/L/D)" for Breakfast/Lunch/
  // Dinner — these start with a capital letter same as a real place, but no
  // real place name contains a slash.
  if (text.includes("/")) return false;
  return /^\p{Lu}/u.test(text);
}

function stripDayPrefix(title) {
  let text = title;
  // Looped: a few operator pages double up the prefix ("Day 1: Day 1: ...")
  // due to markup bugs in their own source data.
  for (let i = 0; i < 3; i++) {
    const stripped = text.replace(/^Day\s*\d+\s*[:.\-]?\s*/i, "").trim();
    if (stripped === text) break;
    text = stripped;
  }
  return text;
}

function stripTrailingPunctuation(text) {
  return text.replace(/[.,;!?]+$/, "").trim();
}

function stripTrailingClauses(text) {
  let current = text;
  for (const pattern of TRAILING_CUT_PATTERNS) {
    current = current.replace(pattern, "");
  }
  return current.trim();
}

/**
 * Scan left to right for runs of capitalized words that are each NOT a
 * generic stopword, joining adjacent ones into multi-word proper nouns
 * ("Namche Bazaar"). A stopword breaks a run just like a lowercase word
 * does, so "Arrival Day in Kathmandu" skips "Arrival" and "Day" (each
 * individually generic) rather than merging them into one false candidate.
 */
function collectRuns(text) {
  const tokens = text.match(/\p{L}[\p{L}'-]*/gu) ?? [];
  const runs = [];
  let current = [];
  for (const token of tokens) {
    const isContentWord = /^\p{Lu}/u.test(token) && !STOPWORDS.has(token.toLowerCase());
    if (isContentWord) {
      current.push(token);
      continue;
    }
    if (current.length) {
      runs.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) runs.push(current.join(" "));
  return runs;
}

function firstPlausibleRun(text) {
  for (const candidate of collectRuns(text)) {
    if (isPlausiblePlaceName(candidate)) return candidate;
  }
  return null;
}

/**
 * Day titles on tourhub.co consistently follow "Day N: Place" or, for
 * travel days, "Day N: PlaceA/PlaceB" / "Day N: PlaceA to PlaceB" (the
 * traveller ends the day at the destination, not the departure point) or,
 * for more narrative operators, "Day N: Fly to Place; do things at Place."
 * A parenthetical, e.g. "Everest Base Camp (Gorak Shep)", usually clarifies
 * the actual overnight stop distinct from the day's highlight.
 */
export function extractTitlePlace(title) {
  const stripped = stripDayPrefix(title);
  if (!stripped) return null;

  // Pull out any parenthetical first — e.g. "Everest Base Camp (Gorak
  // Shep)" — so a comma inside it ("(Gorak Shep, 5164m)") doesn't get
  // caught by the list-splitting below and torn apart.
  const parenMatch = stripped.match(/\(([^)]+)\)/);
  const parenCandidate = parenMatch ? stripTrailingPunctuation(parenMatch[1].trim()) : null;
  let withoutParens = stripped.replace(/\([^)]*\)/g, "").trim();

  // Many operators title days "Place: descriptive subtitle" — everything
  // after the colon is marketing copy, not part of the place name. Cut this
  // BEFORE the list-splitting below, since the subtitle itself often
  // contains its own commas/ampersands ("Place: Ancient Roots & Culinary
  // Delights") that would otherwise get picked as the "last" segment.
  const colonIndex = withoutParens.indexOf(":");
  if (colonIndex !== -1) {
    const beforeColon = withoutParens.slice(0, colonIndex).trim();
    if (beforeColon) withoutParens = beforeColon;
  }

  // Split on every separator operators use between distinct places in a
  // title: "/", "to"/"or"/"and", " - "/" – " (the spaces keep this from
  // matching a hyphen inside a single word like "Stratford-Upon-Avon"), and
  // comma/semicolon/ampersand (sometimes with no space after, e.g.
  // "Windsor,Oxford,Stratford-Upon-Avon"). The traveller ends the day at
  // the last-named place, so that's the one taken as the day's pin.
  const segments = withoutParens.split(/\s*[,;&/]\s*|\s+to\s+|\s+or\s+|\s+and\s+|\s+[-–—]\s+/i);
  const firstSegment = segments[0].trim().toLowerCase();
  const preferSecond = segments.length > 1 && FILLER_SEGMENT_WORDS.has(firstSegment);
  const chosenSegment = preferSecond ? segments[1] : segments[segments.length - 1];

  // A parenthetical usually clarifies the actual overnight stop distinct
  // from the day's highlight ("Everest Base Camp (Gorak Shep)" -> sleeps at
  // Gorak Shep), so prefer it over the surrounding text when present.
  if (parenCandidate && isPlausiblePlaceName(parenCandidate)) return parenCandidate;

  // Priority-ordered fallback chain of segments to try. The chosen segment
  // can turn out to have no real place in it at all — either pure
  // description ("Edinburgh, The Capital of Culture") or a redundant
  // trailing country tag some operators append to every day ("Arusha to
  // Tarangire National Park – Tanzania", where "Tanzania" is filtered as a
  // stopword and the real destination is the segment just before it) — so
  // fall back through the second-to-last segment, then the first (often the
  // anchor place a title opens with), before giving up.
  const fallbackSegments = [chosenSegment];
  if (segments.length > 1) {
    const secondToLast = segments[segments.length - 2];
    if (!fallbackSegments.includes(secondToLast)) fallbackSegments.push(secondToLast);
    if (!fallbackSegments.includes(segments[0])) fallbackSegments.push(segments[0]);
  }

  // A bare country name ("Tanzania") is kept as a last-resort answer — it's
  // sometimes genuinely the only place a day names ("Fly to Thailand") — but
  // a more specific place found in any segment is always preferred over it.
  let countryNameFallback = null;

  for (const segment of fallbackSegments) {
    const cleaned = stripTrailingClauses(segment);

    // "The Viking City of York" / "Gateway to the Highlands in Fort
    // William" style nicknames name the real place only after a trailing
    // "of"/"in" — narrowly targeted (fires only at the end of the segment)
    // so it doesn't disturb unrelated "by"/"with" constructions elsewhere.
    const nicknameMatch = cleaned.match(/\b(?:of|in)\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)*)\s*$/u);
    if (nicknameMatch) {
      const afterConnector = firstPlausibleRun(nicknameMatch[1]);
      if (afterConnector) return afterConnector;
    }

    const found = firstPlausibleRun(cleaned);
    if (found && KNOWN_COUNTRY_NAMES.has(found.toLowerCase())) {
      countryNameFallback = countryNameFallback ?? found;
      continue;
    }
    if (found) return found;
  }

  return countryNameFallback;
}

/**
 * Fallback candidates from a day's prose description, in order of mention —
 * used both when the title yields no place at all, and as further tries
 * when the title's candidate turns out to name something ungeocodable (e.g.
 * "Golden Circle" is a real touring route with no single Nominatim point,
 * but the prose describing it mentions specific stops like "Thingvellir" and
 * "Gullfoss" that do geocode). Low confidence by design — these are just
 * capitalized words in free text, not a curated list — but ordering by
 * appearance means the first real landmark mentioned is tried first.
 */
export function extractProseCandidates(prose, maxCandidates = 10) {
  const text = (prose || "").slice(0, 1200);
  const candidates = [];
  // No stripTrailingClauses here — that's tuned for short title segments
  // ("Namche Bazaar Duration: ...") and would wrongly truncate a long
  // paragraph if any of its trigger words appear anywhere within it.
  for (const run of collectRuns(text)) {
    if (!isPlausiblePlaceName(run)) continue;
    if (candidates.includes(run)) continue;
    candidates.push(run);
    if (candidates.length >= maxCandidates) break;
  }
  return candidates;
}
