function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const OUTLIER_ABSOLUTE_KM = 800;
const OUTLIER_RELATIVE_MULTIPLIER = 4;

/**
 * Drops days whose location is a wild geographic outlier relative to the
 * rest of the tour — e.g. a "Depart/Arrive London" flight day tacked onto an
 * otherwise Southeast-Asia-only itinerary. That data is genuinely correct,
 * but plotting it would zoom the whole focused view out to fit two
 * unrelated regions and make the actual route unreadable.
 *
 * A day is dropped only if it's both far in absolute terms (> 800km from
 * the tour's typical center) AND far relative to how spread out the rest of
 * the tour already is (> 4x the median distance-to-center) — so a
 * legitimately large tour (e.g. a full coast-to-coast itinerary) doesn't
 * get days incorrectly stripped just because it naturally covers more
 * ground.
 */
export function filterOutlierDays(days) {
  if (days.length < 3) return days; // too few points for "typical spread" to mean anything

  const centroid = [median(days.map((d) => d.location.lat)), median(days.map((d) => d.location.lng))];
  const distances = days.map((d) => haversineKm(centroid, [d.location.lat, d.location.lng]));
  const typicalSpread = median(distances);
  const threshold = Math.max(OUTLIER_ABSOLUTE_KM, typicalSpread * OUTLIER_RELATIVE_MULTIPLIER);

  return days.filter((_, i) => distances[i] <= threshold);
}
