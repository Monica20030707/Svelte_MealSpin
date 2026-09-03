"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { app, milesToMeters, formatBusiness } = require("../server");

describe("milesToMeters", () => {
  it("converts miles and caps at 40000", () => {
    assert.equal(milesToMeters(5), 8047);
    assert.ok(milesToMeters(25) <= 40000);
    assert.equal(milesToMeters(100), 40000);
  });
});

describe("formatBusiness", () => {
  it("maps yelp business fields", () => {
    const out = formatBusiness({
      id: "abc",
      name: "Test Cafe",
      rating: 4.5,
      categories: [{ title: "Coffee & Tea" }, { title: "Bakeries" }],
      distance: 1200,
      location: {
        address1: "1 Main St",
        city: "SF",
        state: "CA",
        zip_code: "94105",
      },
      coordinates: { latitude: 37.7, longitude: -122.4 },
      url: "https://yelp.com/biz/abc",
      image_url: "https://example.com/img.jpg",
      review_count: 42,
      price: "$$",
    });

    assert.equal(out.id, "abc");
    assert.equal(out.name, "Test Cafe");
    assert.deepEqual(out.categories, ["Coffee & Tea", "Bakeries"]);
    assert.equal(out.lat, 37.7);
    assert.equal(out.lng, -122.4);
    assert.match(out.address, /1 Main St/);
  });
});

describe("HTTP endpoints", () => {
  /** @type {import('http').Server} */
  let server;
  /** @type {number} */
  let port;

  it("starts a temporary server", async () => {
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    port = server.address().port;
  });

  it("GET / returns the app shell", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.match(text, /Meal Spin/);
    assert.match(text, /Spin for lunch nearby/);
  });

  it("GET /api/spin without key returns 503", async () => {
    const prev = process.env.YELP_API_KEY;
    delete process.env.YELP_API_KEY;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/spin?lat=37.77&lng=-122.42&radiusMiles=10&sessionId=test`
    );
    const data = await res.json();
    assert.equal(res.status, 503);
    assert.match(data.error, /YELP_API_KEY/);
    if (prev !== undefined) process.env.YELP_API_KEY = prev;
  });

  it("GET /api/spin with bad coords returns 400", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/spin?lat=notanum&lng=-122&radiusMiles=10&sessionId=test`
    );
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.ok(data.error);
  });

  it("POST /api/blacklist adds an id", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/blacklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "unit-test-session", businessId: "biz-1" }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.ok(data.count >= 1);
  });

  it("closes the temporary server", async () => {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
});
