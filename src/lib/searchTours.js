const MAX_RESULTS = 8;

// Small edit-distance helper so a typo ("Islnad") still surfaces "Iceland"
// results instead of coming up empty — only used as a last-resort fallback
// when there's no direct substring match (see scoreTitle below).
function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[rows - 1][cols - 1];
}

// Higher is better; null means "not a match at all". Ranks an exact match
// highest, then a title starting with the query, then the query appearing
// anywhere, then a word in the title starting with the query, and finally
// falls back to fuzzy (typo-tolerant) word matching before giving up.
function scoreTitle(title, query) {
  if (title === query) return 1000;
  if (title.startsWith(query)) return 900 - (title.length - query.length);

  const substringIndex = title.indexOf(query);
  if (substringIndex !== -1) return 700 - substringIndex;

  const words = title.split(/\s+/);
  if (words.some((w) => w.startsWith(query))) return 600;

  let bestDistance = Infinity;
  for (const word of words) {
    bestDistance = Math.min(bestDistance, levenshtein(query, word.slice(0, query.length + 2)));
  }
  const typoTolerance = Math.max(1, Math.floor(query.length * 0.34));
  if (bestDistance <= typoTolerance) return 400 - bestDistance * 20;

  return null;
}

/**
 * Ranks tours by how closely their title matches the query, closest first.
 * Empty query returns no results (nothing to show a dropdown for).
 */
export function searchTours(tours, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return tours
    .map((tour) => ({ tour, score: scoreTitle(tour.title.toLowerCase(), q) }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.tour);
}
