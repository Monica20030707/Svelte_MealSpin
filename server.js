"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8080;
const YELP_SEARCH_URL = "https://api.yelp.com/v3/businesses/search";
const MAX_RADIUS_METERS = 40000;
const DATA_DIR = path.join(__dirname, "data");
const BLACKLIST_FILE = path.join(DATA_DIR, "blacklist.json");

function getYelpApiKey() {
  return process.env.YELP_API_KEY || "";
}

/** @type {Map<string, Set<string>>} */
const blacklistBySession = new Map();

function milesToMeters(miles) {
  return Math.min(Math.round(Number(miles) * 1609.344), MAX_RADIUS_METERS);
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

function formatBusiness(business) {
  const categories = Array.isArray(business.categories)
    ? business.categories.map((c) => c.title).filter(Boolean)
    : [];
  const location = business.location || {};
  const addressParts = [
    location.address1,
    location.city,
    location.state,
    location.zip_code,
  ].filter(Boolean);

  return {
    id: business.id,
    name: business.name,
    rating: business.rating ?? null,
    categories,
    distance: typeof business.distance === "number" ? business.distance : null,
    address: addressParts.join(", ") || location.display_address?.join(", ") || "",
    lat: business.coordinates?.latitude ?? null,
    lng: business.coordinates?.longitude ?? null,
    url: business.url || "",
    imageUrl: business.image_url || "",
    reviewCount: business.review_count ?? null,
    price: business.price || "",
  };
}

async function searchYelp(lat, lng, radiusMeters) {
  const params = new URLSearchParams({
    term: "restaurants",
    latitude: String(lat),
    longitude: String(lng),
    radius: String(radiusMeters),
    limit: "50",
    open_now: "false",
  });

  const response = await fetch(`${YELP_SEARCH_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${getYelpApiKey()}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`Yelp API error (${response.status})`);
    error.status = response.status;
    error.detail = text;
    throw error;
  }

  const data = await response.json();
  return Array.isArray(data.businesses) ? data.businesses : [];
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

  if (!getYelpApiKey()) {
    return res.status(503).json({
      error: "YELP_API_KEY is not configured. Set it in the environment to enable spins.",
    });
  }

  const sessionId = getSessionId(req);
  const banned = getBlacklist(sessionId);
  const radiusMeters = milesToMeters(radiusMiles);

  try {
    const businesses = await searchYelp(lat, lng, radiusMeters);
    const eligible = businesses.filter((b) => b && b.id && !banned.has(b.id));

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
    return res.json(formatBusiness(pick));
  } catch (err) {
    console.error("Spin failed:", err.message, err.detail || "");
    return res.status(502).json({
      error: "Could not reach Yelp Fusion. Check your API key and try again.",
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
  formatBusiness,
  getBlacklist,
  blacklistBySession,
  loadBlacklistFromDisk,
  persistBlacklist,
};
