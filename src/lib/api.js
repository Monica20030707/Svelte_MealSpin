import { getSessionId } from "./session.js";
import { addLocalSkip, spinFromOverpass } from "./overpass.js";

async function tryServerSpin(params) {
  const res = await fetch(`/api/spin?${params}`, {
    headers: { "X-Session-Id": getSessionId() },
  });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("static-host");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Spin failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function fetchSpin({ lat, lng, radiusMiles, categories, avoidTypes = [] }) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radiusMiles: String(radiusMiles),
    sessionId: getSessionId(),
    categories: categories.join(","),
  });
  if (avoidTypes.length) {
    params.set("avoidTypes", avoidTypes.join(","));
  }

  try {
    return await tryServerSpin(params);
  } catch (err) {
    const status = err && err.status;
    if (status === 400 || status === 404) throw err;
    return spinFromOverpass({ lat, lng, radiusMiles, categories, avoidTypes });
  }
}

export async function skipPlace(businessId) {
  addLocalSkip(businessId);
  try {
    const res = await fetch("/api/blacklist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": getSessionId(),
      },
      body: JSON.stringify({
        sessionId: getSessionId(),
        businessId,
      }),
    });
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return { ok: true };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not skip this place.");
    }
    return data;
  } catch {
    return { ok: true };
  }
}
