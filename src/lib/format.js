export function formatDistance(meters) {
  if (typeof meters !== "number" || Number.isNaN(meters)) return "Distance unknown";
  const miles = meters / 1609.344;
  if (miles < 0.1) return "< 0.1 mi";
  return `${miles.toFixed(1)} mi away`;
}

export function formatRating(rating, reviewCount) {
  if (rating == null) return "No rating";
  const stars = Number(rating).toFixed(1);
  if (reviewCount != null) return `${stars} ★ · ${reviewCount} reviews`;
  return `${stars} ★`;
}

export function mapsLinks(place) {
  const query = place.name || `${place.lat},${place.lng}`;
  const encodedQuery = encodeURIComponent(query);
  const google = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
  const apple =
    place.lat != null && place.lng != null
      ? `https://maps.apple.com/?ll=${place.lat},${place.lng}&q=${encodeURIComponent(place.name || query)}`
      : `https://maps.apple.com/?q=${encodedQuery}`;
  return { google, apple };
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
