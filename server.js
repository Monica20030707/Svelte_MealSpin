"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8080;
const OVERPASS_URL =
  process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const USER_AGENT = process.env.OVERPASS_USER_AGENT || "MealSpin/1.0 (lunch roulette)";
const MAX_RADIUS_METERS = 40000;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_POOL_SIZE = 80;
const DATA_DIR = path.join(__dirname, "data");
const BLACKLIST_FILE = path.join(DATA_DIR, "blacklist.json");

/** @type {Map<string, { expires: number, places: object[] }>} */
const searchCache = new Map();

/** @type {Map<string, Set<string>>} */
const blacklistBySession = new Map();

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
  return parts.join(", ");
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
    url: tags.website || tags["contact:website"] || "",
    imageUrl: "",
    reviewCount: null,
    price: "",
  };
}

function buildOverpassQuery(lat, lng, radiusMeters) {
  return `[out:json][timeout:25];
(
  nwr["amenity"="restaurant"](around:${radiusMeters},${lat},${lng});
  nwr["amenity"="fast_food"](around:${radiusMeters},${lat},${lng});
  nwr["amenity"="cafe"](around:${radiusMeters},${lat},${lng});
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

function cacheKey(lat, lng, radiusMeters) {
  return `${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusMeters}`;
}

async function searchOverpass(lat, lng, radiusMeters) {
  const key = cacheKey(lat, lng, radiusMeters);
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.places;
  }

  const query = buildOverpassQuery(lat, lng, radiusMeters);
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ data: query }).toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`Overpass API error (${response.status})`);
    error.status = response.status;
    error.detail = text;
    throw error;
  }

  const data = await response.json();
  const elements = Array.isArray(data.elements) ? data.elements : [];
  const named = elements.filter((el) => el && el.tags && el.tags.name && elementCoords(el));
  shuffleInPlace(named);
  const places = named.slice(0, MAX_POOL_SIZE).map((el) => formatPlace(el, lat, lng));

  searchCache.set(key, { expires: Date.now() + SEARCH_CACHE_TTL_MS, places });
  return places;
}

function loadBlacklistFromDisk() {
  try {
    if (!fs.existsSync(BLACKLIST_FILE)) return;
    const raw = fs.readFileSync(BLACKLIST_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    for (const [sessionId, ids] of Object.entries(parsed)) {
      if (Array.isArray(ids)) {
        blacklistBySession.set(sessionId, new Set(ids.filter((id) => typeof id === "string")));
      }
    }
  } catch (err) {
    console.warn("Could not load blacklist file:", err.message);
  }
}

function persistBlacklist() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const obj = {};
    for (const [sessionId, ids] of blacklistBySession.entries()) {
      obj[sessionId] = Array.from(ids);
    }
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.warn("Could not persist blacklist:", err.message);
  }
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

loadBlacklistFromDisk();

const app = express();
app.use(express.json());

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

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

  const sessionId = getSessionId(req);
  const banned = getBlacklist(sessionId);
  const radiusMeters = milesToMeters(radiusMiles);

  try {
    const places = await searchOverpass(lat, lng, radiusMeters);
    const eligible = places.filter((p) => p && p.id && !banned.has(p.id));

    if (eligible.length === 0) {
      return res.status(404).json({
        error:
          banned.size > 0
            ? "No restaurants left in this area after excluding banned places. Try a larger radius or clear bans by refreshing the session."
            : "No restaurants found near this location for the selected radius. Try a larger radius or different location.",
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
  persistBlacklist();

  return res.json({ ok: true, count: set.size });
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
  getBlacklist,
  blacklistBySession,
  loadBlacklistFromDisk,
  persistBlacklist,
};
