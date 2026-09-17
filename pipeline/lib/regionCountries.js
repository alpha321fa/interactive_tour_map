// Fallback acceptable-country sets per urls.txt region label, used only when
// a tour's JSON-LD itinerary gives us no country-suffixed place names to derive
// countries from directly. Regions that legitimately span multiple countries
// (per the notes in urls.txt) list all of them.
export const REGION_COUNTRY_ALIASES = {
  Nepal: ["Nepal"],
  Morocco: ["Morocco"],
  Peru: ["Peru"],
  "Vietnam / Cambodia / Thailand": ["Vietnam", "Cambodia", "Thailand", "Laos"],
  "Egypt / Jordan": ["Egypt", "Jordan", "Israel", "Palestine", "Palestinian Territories"],
  Japan: ["Japan"],
  Iceland: ["Iceland"],
  Tanzania: ["Tanzania"],
  "United Kingdom": ["United Kingdom", "Ireland"],
};
