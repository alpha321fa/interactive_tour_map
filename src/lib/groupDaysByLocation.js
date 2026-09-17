// Groups a tour's resolved days by location so that days sharing the same
// place (e.g. two nights in the same city) render as one pin with a
// combined label instead of stacking identical markers on top of each other.
export function groupDaysByLocation(days) {
  const groups = [];
  const indexByKey = new Map();

  for (const day of days) {
    if (!day.location) continue;
    const key = `${day.location.lat.toFixed(4)},${day.location.lng.toFixed(4)}`;
    if (indexByKey.has(key)) {
      groups[indexByKey.get(key)].dayNumbers.push(day.dayNumber);
    } else {
      indexByKey.set(key, groups.length);
      groups.push({ location: day.location, dayNumbers: [day.dayNumber] });
    }
  }

  return groups;
}

// [1, 2, 3, 7] -> "1-3,7"
export function formatDayLabel(dayNumbers) {
  const sorted = [...new Set(dayNumbers)].sort((a, b) => a - b);
  const parts = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === rangeEnd + 1) {
      rangeEnd = sorted[i];
    } else {
      parts.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
      rangeStart = rangeEnd = sorted[i];
    }
  }
  parts.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
  return parts.join(",");
}
