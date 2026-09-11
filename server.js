"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

function loadEnvFiles() {
  const parsed = {};
  for (const name of [".env", ".env.local"]) {
    const filePath = path.join(__dirname, name);
    if (!fs.existsSync(filePath)) continue;
    for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      parsed[key] = value;
    }
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFiles();

const PORT = Number(process.env.PORT) || 8080;
const DEFAULT_OVERPASS_URLS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const OVERPASS_URLS = parseOverpassUrls(process.env.OVERPASS_URL);
const USER_AGENT = process.env.OVERPASS_USER_AGENT || "MealSpin/1.0 (lunch roulette)";
const OVERPASS_FETCH_MS = 12000;
const MAX_RADIUS_METERS = 40000;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_POOL_SIZE = 80;

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
const ALL_CATEGORY_IDS = [...VENUE_IDS, ...FOOD_IDS];

/** @type {Map<string, { expires: number, places: object[] }>} */
const searchCache = new Map();

/** @type {Map<string, Set<string>>} */
const blacklistBySession = new Map();

function parseOverpassUrls(raw) {
  const fromEnv = String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length === 0) return [...DEFAULT_OVERPASS_URLS];
  const extras = DEFAULT_OVERPASS_URLS.filter((url) => !fromEnv.includes(url));
  return [...fromEnv, ...extras];
}

function milesToMeters(miles) {
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
  const parts = [
    line1,
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"],
  ].filter(Boolean);
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
  return (
    firstHttpUrl(tags.image) ||
    firstHttpUrl(tags["image:0"]) ||
    wikimediaFileUrl(tags.wikimedia_commons) ||
    ""
  );
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
  const all = {
    venues: new Set(VENUE_IDS),
    foods: new Set(FOOD_IDS),
    allVenues: true,
    allFoods: true,
    empty: false,
  };

  if (raw == null || String(raw).trim() === "") return all;

  const requested = new Set(
    String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter((id) => ALL_CATEGORY_IDS.includes(id))
  );
  const venues = VENUE_IDS.filter((id) => requested.has(id));
  const foods = FOOD_IDS.filter((id) => requested.has(id));

  if (venues.length === 0 && foods.length === 0) {
    return { venues: new Set(), foods: new Set(), allVenues: false, allFoods: false, empty: true };
  }

  const effectiveVenues = venues.length > 0 ? venues : VENUE_IDS;
  return {
    venues: new Set(effectiveVenues),
    foods: new Set(foods.length > 0 ? foods : FOOD_IDS),
    allVenues: effectiveVenues.length === VENUE_IDS.length && venues.length > 0,
    allFoods: foods.length === 0 || foods.length === FOOD_IDS.length,
    empty: false,
  };
}

function cuisineMatchesFoods(rawCuisine, foodIds) {
  if (!rawCuisine || typeof rawCuisine !== "string") return false;
  const lower = rawCuisine.toLowerCase();
  for (const id of foodIds) {
    const aliases = FOOD_ALIASES[id] || [];
    for (const alias of aliases) {
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

function elementMatchesSelection(element, selection) {
  const tags = element.tags && typeof element.tags === "object" ? element.tags : {};
  if (!selection.venues.has(tags.amenity)) return false;
  if (selection.allFoods) return true;
  return cuisineMatchesFoods(tags.cuisine, selection.foods);
}

function buildOverpassQuery(lat, lng, radiusMeters, selection) {
  const chosen = selection || parseCategoryParam("");
  const amenities = VENUE_IDS.filter((id) => chosen.venues.has(id));
  const cuisineFilter =
    chosen.allFoods || chosen.foods.size === 0
      ? ""
      : `["cuisine"~"${cuisineRegex(chosen.foods)}",i]`;
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

function parseAvoidTypes(raw) {
  if (raw == null || String(raw).trim() === "") return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((id) => ALL_CATEGORY_IDS.includes(id));
}

function placeFoodTypes(place) {
  const cats = Array.isArray(place.categories) ? place.categories : [];
  const joined = cats.join(";");
  const foods = FOOD_IDS.filter((id) => cuisineMatchesFoods(joined, [id]));
  if (foods.length) return foods;
  return VENUE_IDS.filter((id) => cats.some((label) => String(label).toLowerCase() === amenityLabel(id).toLowerCase()));
}

function cacheKey(lat, lng, radiusMeters, selection) {
  const venues = [...selection.venues].sort().join("+");
  const foods = selection.allFoods ? "*" : [...selection.foods].sort().join("+");
  return `${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusMeters}:${venues}:${foods}`;
}

async function searchOverpass(lat, lng, radiusMeters, selection) {
  const key = cacheKey(lat, lng, radiusMeters, selection);
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.places;
  }

  const query = buildOverpassQuery(lat, lng, radiusMeters, selection);
  const data = await fetchOverpassJson(query);
  const elements = Array.isArray(data.elements) ? data.elements : [];
  const named = elements.filter(
    (el) => el && el.tags && el.tags.name && elementCoords(el) && elementMatchesSelection(el, selection)
  );
  shuffleInPlace(named);
  const places = named.slice(0, MAX_POOL_SIZE).map((el) => formatPlace(el, lat, lng));

  searchCache.set(key, { expires: Date.now() + SEARCH_CACHE_TTL_MS, places });
  return places;
}

async function fetchOverpassJson(query) {
  const body = new URLSearchParams({ data: query }).toString();
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
  let lastError = new Error("Overpass API error");

  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(OVERPASS_FETCH_MS),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        lastError = new Error(`Overpass API error (${response.status})`);
        lastError.status = response.status;
        lastError.detail = text;
        continue;
      }
      return await response.json();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

function getSessionId(req) {
  const fromQuery = req.query.sessionId;
  const fromHeader = req.get("x-session-id");
  const fromBody = req.body && req.body.sessionId;
  const id = fromQuery || fromHeader || fromBody;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function getBlacklist(sessionId) {
  if (!sessionId) return new Set();
  if (!blacklistBySession.has(sessionId)) {
    blacklistBySession.set(sessionId, new Set());
  }
  return blacklistBySession.get(sessionId);
}

const app = express();
app.use(express.json());

const clientDir = path.join(__dirname, "dist");

app.get("/api/spin", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusMiles = Number(req.query.radiusMiles);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      error: "Missing or invalid location. Provide lat and lng query parameters.",
    });
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      error: "Location out of range. Latitude must be -90..90 and longitude -180..180.",
    });
  }

  if (![5, 10, 15, 25].includes(radiusMiles)) {
    return res.status(400).json({
      error: "Invalid radiusMiles. Choose 5, 10, 15, or 25.",
    });
  }

  const selection = parseCategoryParam(req.query.categories);
  if (selection.empty) {
    return res.status(400).json({
      error: "Select at least one category to spin.",
    });
  }

  const sessionId = getSessionId(req);
  const banned = getBlacklist(sessionId);
  const radiusMeters = milesToMeters(radiusMiles);

  try {
    const places = await searchOverpass(lat, lng, radiusMeters, selection);
    const avoidTypes = new Set(parseAvoidTypes(req.query.avoidTypes));
    let eligible = places.filter((p) => p && p.id && !banned.has(p.id));
    if (avoidTypes.size > 0) {
      const varied = eligible.filter(
        (p) => !placeFoodTypes(p).some((type) => avoidTypes.has(type))
      );
      if (varied.length > 0) eligible = varied;
    }

    if (eligible.length === 0) {
      return res.status(404).json({
        error:
          banned.size > 0
            ? "No places left in this area after skips. Try a larger radius, more categories, or close the browser to reset skips."
            : "No places found near this location for the selected radius and categories. Try a larger radius or more categories.",
        bannedCount: banned.size,
      });
    }

    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    return res.json(pick);
  } catch (err) {
    console.error("Spin failed:", err.message, err.detail || "");
    return res.status(502).json({
      error: "Could not reach OpenStreetMap Overpass. Try again in a moment.",
    });
  }
});

app.post("/api/blacklist", (req, res) => {
  const sessionId = getSessionId(req);
  const businessId = req.body && req.body.businessId;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required." });
  }
  if (typeof businessId !== "string" || !businessId.trim()) {
    return res.status(400).json({ error: "businessId is required." });
  }

  const set = getBlacklist(sessionId);
  set.add(businessId.trim());

  return res.json({ ok: true, count: set.size });
});

app.use(express.static(clientDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Meal Spin listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = {
  app,
  milesToMeters,
  haversineMeters,
  formatPlace,
  buildOverpassQuery,
  parseOverpassUrls,
  parseCategoryParam,
  placeFoodTypes,
  cuisineMatchesFoods,
  ALL_CATEGORY_IDS,
  osmImageUrl,
  getBlacklist,
  blacklistBySession,
};
