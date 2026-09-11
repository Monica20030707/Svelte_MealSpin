import { getSessionId } from "./session.js";

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

  const res = await fetch(`/api/spin?${params}`, {
    headers: { "X-Session-Id": getSessionId() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Spin failed (${res.status})`);
  }
  return data;
}

export async function skipPlace(businessId) {
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Could not skip this place.");
  }
  return data;
}
