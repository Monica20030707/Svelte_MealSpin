"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  app,
  milesToMeters,
  haversineMeters,
  formatPlace,
  buildOverpassQuery,
  parseCategoryParam,
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
    assert.equal(out.imageUrl, "");
  });

  it("uses OSM image or Wikimedia file tags for the thumbnail", () => {
    const withImage = formatPlace(
      {
        type: "node",
        id: 1,
        lat: 37.7,
        lon: -122.4,
        tags: { name: "Pix Cafe", image: "https://example.com/shop.jpg" },
      },
      37.7,
      -122.4
    );
    assert.equal(withImage.imageUrl, "https://example.com/shop.jpg");

    const withCommons = formatPlace(
      {
        type: "node",
        id: 2,
        lat: 37.7,
        lon: -122.4,
        tags: { name: "Wiki Cafe", wikimedia_commons: "File:Wiki Cafe.jpg" },
      },
      37.7,
      -122.4
    );
    assert.equal(
      withCommons.imageUrl,
      "https://commons.wikimedia.org/wiki/Special:FilePath/Wiki%20Cafe.jpg?width=400"
    );
  });
});

describe("parseCategoryParam", () => {
  it("defaults to every venue and food", () => {
    const all = parseCategoryParam("");
    assert.equal(all.empty, false);
    assert.equal(all.allFoods, true);
    assert.ok(all.venues.has("restaurant"));
  });

  it("treats pizza-only as all venues with a food filter", () => {
    const pizza = parseCategoryParam("pizza");
    assert.equal(pizza.allFoods, false);
    assert.ok(pizza.foods.has("pizza"));
    assert.ok(pizza.venues.has("restaurant"));
    assert.ok(pizza.venues.has("cafe"));
  });
});

describe("buildOverpassQuery", () => {
  it("includes restaurant amenities and around clause", () => {
    const q = buildOverpassQuery(37.77, -122.42, 8047);
    assert.match(q, /amenity"="restaurant/);
    assert.match(q, /around:8047,37.77,-122.42/);
    assert.doesNotMatch(q, /cuisine/);
  });

  it("adds a cuisine constraint when foods are narrowed", () => {
    const q = buildOverpassQuery(37.77, -122.42, 8047, parseCategoryParam("pizza"));
    assert.match(q, /cuisine"~"pizza"/);
    assert.match(q, /amenity"="restaurant/);
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
  });

  it("GET /api/spin with bad coords returns 400", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/spin?lat=notanum&lng=-122&radiusMiles=10&sessionId=test`
    );
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.ok(data.error);
  });

  it("GET /api/spin maps Overpass results", async () => {
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
    assert.equal(data.imageUrl, "");
  });

  it("GET /api/spin uses the OSM image tag when present", async () => {
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
                id: 42,
                lat: 37.775,
                lon: -122.419,
                tags: {
                  name: "Photo Cafe",
                  amenity: "cafe",
                  image: "https://example.com/cafe.jpg",
                },
              },
            ],
          };
        },
      };
    };

    const res = await fetch(
      `http://127.0.0.1:${port}/api/spin?lat=37.77&lng=-122.42&radiusMiles=5&sessionId=test-photo`
    );
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.name, "Photo Cafe");
    assert.equal(data.imageUrl, "https://example.com/cafe.jpg");
  });

  it("GET /api/spin keeps only places matching a food category", async () => {
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
                id: 1,
                lat: 37.775,
                lon: -122.419,
                tags: { name: "Thai Place", amenity: "restaurant", cuisine: "thai" },
              },
              {
                type: "node",
                id: 2,
                lat: 37.776,
                lon: -122.418,
                tags: { name: "Slice Shop", amenity: "restaurant", cuisine: "pizza" },
              },
            ],
          };
        },
      };
    };

    const res = await fetch(
      `http://127.0.0.1:${port}/api/spin?lat=37.77&lng=-122.42&radiusMiles=10&sessionId=test-pizza&categories=pizza`
    );
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.name, "Slice Shop");
    assert.equal(data.id, "node/2");
  });

  it("GET /api/spin skips the avoided food type when another type exists", async () => {
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
                id: 11,
                lat: 37.775,
                lon: -122.419,
                tags: { name: "Thai Place", amenity: "restaurant", cuisine: "thai" },
              },
              {
                type: "node",
                id: 12,
                lat: 37.776,
                lon: -122.418,
                tags: { name: "Slice Shop", amenity: "restaurant", cuisine: "pizza" },
              },
            ],
          };
        },
      };
    };

    const res = await fetch(
      `http://127.0.0.1:${port}/api/spin?lat=37.77&lng=-122.42&radiusMiles=10&sessionId=avoid-thai&categories=pizza,thai&avoidTypes=thai`
    );
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.name, "Slice Shop");
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

  it("POST /api/blacklist does not write data/blacklist.json", async () => {
    const file = path.join(__dirname, "../data/blacklist.json");
    const res = await fetch(`http://127.0.0.1:${port}/api/blacklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "disk-should-not-update", businessId: "node/no-disk" }),
    });
    assert.equal(res.status, 200);
    assert.equal(fs.existsSync(file), false);
  });
});
