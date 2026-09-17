import L from "leaflet";

// Default Leaflet marker PNGs don't resolve correctly under Vite's bundler,
// so every marker on this map uses a small CSS-styled divIcon instead.

export const overviewIcon = L.divIcon({
  className: "tourhub-pin tourhub-pin--overview",
  html: '<span class="tourhub-pin__dot"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const dayIconCache = new Map();

// `label` is the day number, or a combined label like "1-2" or "1,4" when
// multiple days share the same location. Wider labels get a wider pill
// shape rather than being squeezed into a fixed circle.
export function dayIcon(label, { isFirst, isLast } = {}) {
  const cacheKey = `${label}-${isFirst ? 1 : 0}-${isLast ? 1 : 0}`;
  if (dayIconCache.has(cacheKey)) return dayIconCache.get(cacheKey);

  const modifier = isFirst ? " tourhub-pin--start" : isLast ? " tourhub-pin--end" : "";
  const wide = String(label).length > 2;
  const width = wide ? 14 + String(label).length * 7 : 28;
  const icon = L.divIcon({
    className: `tourhub-pin tourhub-pin--day${modifier}${wide ? " tourhub-pin--wide" : ""}`,
    html: `<span class="tourhub-pin__badge">${label}</span>`,
    iconSize: [width, 28],
    iconAnchor: [width / 2, 14],
  });
  dayIconCache.set(cacheKey, icon);
  return icon;
}
