// ISO 3166-1 alpha-2 codes for every country that appears (or could appear,
// via REGION_COUNTRY_ALIASES) across the seed regions, plus aliases for
// names Tourhub's own data uses loosely as if they were countries (Tourhub
// itinerary places are frequently suffixed "..., Scotland" or "..., England"
// rather than "..., United Kingdom").
const COUNTRY_TO_ISO = {
  nepal: "np",
  morocco: "ma",
  peru: "pe",
  vietnam: "vn",
  cambodia: "kh",
  thailand: "th",
  laos: "la",
  egypt: "eg",
  jordan: "jo",
  israel: "il",
  palestine: "ps",
  "palestinian territories": "ps",
  japan: "jp",
  iceland: "is",
  tanzania: "tz",
  "united kingdom": "gb",
  uk: "gb",
  england: "gb",
  scotland: "gb",
  wales: "gb",
  "northern ireland": "gb",
  ireland: "ie",
};

export function countryNameToIsoCode(name) {
  const key = name.trim().toLowerCase().replace(/^the\s+/, "");
  return COUNTRY_TO_ISO[key] ?? null;
}

export const KNOWN_COUNTRY_NAMES = new Set(Object.keys(COUNTRY_TO_ISO));
