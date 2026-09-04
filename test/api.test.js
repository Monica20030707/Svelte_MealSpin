"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  app,
  milesToMeters,
  haversineMeters,
  formatPlace,
  buildOverpassQuery,
} = require("../server");

describe("milesToMeters", () => {
  it("converts miles and caps at 40000", () => {
    assert.equal(milesToMeters(5), 8047);
    assert.ok(milesToMeters(25) <= 40000);
    assert.equal(milesToMeters(100), 40000);
  });
});

describe("haversineMeters", () => {
  it("returns ~0 for the same point", () => {
    assert.ok(haversineMeters(37.77, -122.42, 37.77, -122.42) < 1);
  });
});

describe("formatPlace", () => {
  it("maps OpenStreetMap element fields", () => {
    const out = formatPlace(
      {
        type: "node",
        id: 123,
        lat: 37.7,
        lon: -122.4,
        tags: {
          name: "Test Cafe",
          amenity: "cafe",
          cuisine: "coffee_shop;bakery",
          "addr:housenumber": "1",
          "addr:street": "Main St",
          "addr:city": "SF",
          website: "https://example.com",
        },
      },
      37.7,
      -122.4
    );

    assert.equal(out.id, "node/123");
    assert.equal(out.name, "Test Cafe");
    assert.deepEqual(out.categories, ["Coffee Shop", "Bakery"]);
    assert.equal(out.lat, 37.7);
    assert.equal(out.lng, -122.4);
    assert.match(out.address, /1 Main St/);
    assert.equal(out.url, "https://example.com");
    assert.equal(out.rating, null);
  });
});

describe("buildOverpassQuery", () => {
  it("includes restaurant amenities and around clause", () => {
    const q = buildOverpassQuery(37.77, -122.42, 8047);
    assert.match(q, /amenity"="restaurant/);
    assert.match(q, /around:8047,37.77,-122.42/);
  });
});

describe("HTTP endpoints", () => {
  /** @type {import('http').Server} */
  let server;
  /** @type {number} */
  let port;
  const originalFetch = globalThis.fetch;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    port = server.address().port;
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("GET / returns the app shell", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.match(text, /Meal Spin/);
    assert.match(text, /Spin for lunch nearby/);
  });

  it("GET /api/spin with bad coords returns 400", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/spin?lat=notanum&lng=-122&radiusMiles=10&sessionId=test`
    );
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.ok(data.error);
  });

  it("GET /api/spin maps Overpass results without an API key", async () => {
    globalThis.fetch = async (url, options) => {
      if (typeof url === "string" && url.includes("127.0.0.1")) {
        return originalFetch(url, options);
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            elements: [
              {
                type: "node",
                id: 99,
                lat: 37.775,
                lon: -122.419,
                tags: { name: "Spin Diner", amenity: "restaurant", cuisine: "thai" },
              },
            ],
          };
        },
      };
    };

    const res = await fetch(
      `http://127.0.0.1:${port}/api/spin?lat=37.77&lng=-122.42&radiusMiles=10&sessionId=test-osm`
    );
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.name, "Spin Diner");
    assert.equal(data.id, "node/99");
    assert.ok(data.categories.includes("Thai"));
  });

  it("POST /api/blacklist adds an id", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/blacklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "unit-test-session", businessId: "node/1" }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.ok(data.count >= 1);
  });
});
