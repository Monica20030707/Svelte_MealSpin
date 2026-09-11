import { ALL_CATEGORY_IDS, foodTypesFromCategories } from "./categories.js";

const OVERPASS_URLS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const OVERPASS_FETCH_MS = 12000;
const MAX_RADIUS_METERS = 40000;
const MAX_POOL_SIZE = 80;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SKIP_KEY = "meal-spin-local-skips";

const VENUE_IDS = ["restaurant", "cafe", "fast_food"];
const FOOD_ALIASES = {
  pizza: ["pizza"],
  sushi: ["sushi", "sashimi"],
  mexican: ["mexican", "tex-mex", "taco", "tacos"],
  vietnamese: ["vietnamese", "pho"],
  chinese: ["chinese"],
  thai: ["thai"],
  indian: ["indian"],
  korean: ["korean"],
  japanese: ["japanese", "ramen"],
  italian: ["italian", "pasta"],
  burgers: ["burger", "burgers"],
  sandwiches: ["sandwich", "sandwiches"],
  seafood: ["seafood", "fish"],
};
const FOOD_IDS = Object.keys(FOOD_ALIASES);

/** @type {Map<string, { expires: number, places: object[] }>} */
const searchCache = new Map();

export function milesToMeters(miles) {
  return Math.min(Math.round(Number(miles) * 1609.344), MAX_RADIUS_METERS);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const earthMeters = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthMeters * Math.asin(Math.min(1, Math.sqrt(a)));
}

function titleCaseCuisine(value) {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseCuisineTags(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(titleCaseCuisine);
}

function amenityLabel(amenity) {
  if (amenity === "fast_food") return "Fast food";
  if (amenity === "cafe") return "Cafe";
  return "Restaurant";
}

function elementCoords(element) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function formatAddress(tags) {
  const line1 = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const parts = [line1, tags["addr:city"], tags["addr:state"], tags["addr:postcode"]].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return typeof tags["addr:full"] === "string" ? tags["addr:full"].trim() : "";
}

function firstHttpUrl(value) {
  if (typeof value !== "string") return "";
  const first = value.split(/[;\n]/)[0].trim();
  try {
    const parsed = new URL(first);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
  } catch {
    return "";
  }
  return "";
}

function wikimediaFileUrl(value) {
  if (typeof value !== "string") return "";
  const first = value.split(/[;\n]/)[0].trim();
  if (!first || /^Category:/i.test(first)) return "";
  const filename = first.replace(/^(?:File|Image):/i, "").trim();
  if (!filename || !/\.(jpe?g|png|gif|webp|svg)$/i.test(filename)) return "";
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=400`;
}

function osmImageUrl(tags) {
  return firstHttpUrl(tags.image) || firstHttpUrl(tags["image:0"]) || wikimediaFileUrl(tags.wikimedia_commons) || "";
}

function osmFlag(value) {
  const v = String(value || "").toLowerCase();
  if (v === "yes" || v === "only" || v === "designated") return "Yes";
  if (v === "no") return "No";
  if (v === "limited") return "Limited";
  return "";
}

function formatPlace(element, originLat, originLng) {
  const tags = element.tags && typeof element.tags === "object" ? element.tags : {};
  const coords = elementCoords(element);
  const categories = parseCuisineTags(tags.cuisine);
  if (categories.length === 0 && tags.amenity) {
    categories.push(amenityLabel(tags.amenity));
  }
  const distance =
    coords && Number.isFinite(originLat) && Number.isFinite(originLng)
      ? haversineMeters(originLat, originLng, coords.lat, coords.lng)
      : null;

  return {
    id: `${element.type}/${element.id}`,
    name: tags.name || "Unnamed place",
    rating: null,
    categories,
    distance,
    address: formatAddress(tags),
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null,
    url: firstHttpUrl(tags.website) || firstHttpUrl(tags["contact:website"]) || "",
    imageUrl: osmImageUrl(tags),
    reviewCount: null,
    price: "",
    phone: tags.phone || tags["contact:phone"] || tags["contact:mobile"] || "",
    hours: tags.opening_hours || "",
    delivery: osmFlag(tags.delivery),
    wheelchair: osmFlag(tags.wheelchair),
  };
}

function parseCategoryParam(raw) {
  const requested = new Set(
    String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter((id) => ALL_CATEGORY_IDS.includes(id))
  );
  const venues = VENUE_IDS.filter((id) => requested.has(id));
  const foods = FOOD_IDS.filter((id) => requested.has(id));
  if (venues.length === 0 && foods.length === 0) {
    return { venues: new Set(), foods: new Set(), allFoods: false, empty: true };
  }
  const effectiveVenues = venues.length > 0 ? venues : VENUE_IDS;
  return {
    venues: new Set(effectiveVenues),
    foods: new Set(foods.length > 0 ? foods : FOOD_IDS),
    allFoods: foods.length === 0 || foods.length === FOOD_IDS.length,
    empty: false,
  };
}

function cuisineMatchesFoods(rawCuisine, foodIds) {
  if (!rawCuisine || typeof rawCuisine !== "string") return false;
  const lower = rawCuisine.toLowerCase();
  for (const id of foodIds) {
    for (const alias of FOOD_ALIASES[id] || []) {
      if (lower.includes(alias)) return true;
    }
  }
  return false;
}

function cuisineRegex(foodIds) {
  const aliases = [];
  for (const id of foodIds) {
    for (const alias of FOOD_ALIASES[id] || []) {
      aliases.push(alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    }
  }
  return [...new Set(aliases)].join("|");
}

function buildOverpassQuery(lat, lng, radiusMeters, selection) {
  const amenities = VENUE_IDS.filter((id) => selection.venues.has(id));
  const cuisineFilter =
    selection.allFoods || selection.foods.size === 0
      ? ""
      : `["cuisine"~"${cuisineRegex(selection.foods)}",i]`;
  const around = `(around:${radiusMeters},${lat},${lng})`;
  const lines = amenities.map((amenity) => `  nwr["amenity"="${amenity}"]${cuisineFilter}${around};`);
  return `[out:json][timeout:25];
(
${lines.join("\n")}
);
out center;`;
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

async function fetchOverpassJson(query) {
  const body = new URLSearchParams({ data: query }).toString();
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Accept: "application/json",
  };
  let lastError = new Error("Could not reach OpenStreetMap Overpass. Try again in a moment.");

  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(OVERPASS_FETCH_MS),
      });
      if (!response.ok) {
        lastError = new Error(`Overpass API error (${response.status})`);
        continue;
      }
      return await response.json();
    } catch (err) {
      lastError = err instanceof Error ? err : lastError;
    }
  }
  throw lastError;
}

function cacheKey(lat, lng, radiusMeters, selection) {
  const venues = [...selection.venues].sort().join("+");
  const foods = selection.allFoods ? "*" : [...selection.foods].sort().join("+");
  return `${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusMeters}:${venues}:${foods}`;
}

export function getLocalSkips() {
  try {
    const raw = localStorage.getItem(SKIP_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function addLocalSkip(businessId) {
  const skips = getLocalSkips();
  skips.add(businessId);
  localStorage.setItem(SKIP_KEY, JSON.stringify([...skips]));
  return skips.size;
}

export async function spinFromOverpass({ lat, lng, radiusMiles, categories, avoidTypes = [] }) {
  const selection = parseCategoryParam(categories.join(","));
  if (selection.empty) {
    throw new Error("Select at least one category to spin.");
  }

  const radiusMeters = milesToMeters(radiusMiles);
  const key = cacheKey(lat, lng, radiusMeters, selection);
  let places;
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) {
    places = cached.places;
  } else {
    const data = await fetchOverpassJson(buildOverpassQuery(lat, lng, radiusMeters, selection));
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const named = elements.filter((el) => {
      const tags = el && el.tags;
      if (!tags || !tags.name || !elementCoords(el)) return false;
      if (!selection.venues.has(tags.amenity)) return false;
      if (selection.allFoods) return true;
      return cuisineMatchesFoods(tags.cuisine, selection.foods);
    });
    shuffleInPlace(named);
    places = named.slice(0, MAX_POOL_SIZE).map((el) => formatPlace(el, lat, lng));
    searchCache.set(key, { expires: Date.now() + SEARCH_CACHE_TTL_MS, places });
  }

  const banned = getLocalSkips();
  let eligible = places.filter((p) => p && p.id && !banned.has(p.id));
  if (avoidTypes.length) {
    const avoid = new Set(avoidTypes);
    const varied = eligible.filter(
      (p) => !foodTypesFromCategories(p.categories).some((type) => avoid.has(type))
    );
    if (varied.length > 0) eligible = varied;
  }

  if (eligible.length === 0) {
    throw new Error(
      banned.size > 0
        ? "No places left in this area after skips. Try a larger radius, more categories, or close the browser to reset skips."
        : "No places found near this location for the selected radius and categories. Try a larger radius or more categories."
    );
  }

  return eligible[Math.floor(Math.random() * eligible.length)];
}
