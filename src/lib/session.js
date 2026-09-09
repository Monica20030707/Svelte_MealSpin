const SESSION_COOKIE = "meal-spin-session-id";

function getCookie(name) {
  const parts = `; ${document.cookie}`.split(`; ${name}=`);
  if (parts.length < 2) return "";
  return decodeURIComponent(parts.pop().split(";").shift() || "");
}

function setSessionCookie(id) {
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(id)}; path=/; SameSite=Lax`;
}

export function getSessionId() {
  let id = getCookie(SESSION_COOKIE);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `ms-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setSessionCookie(id);
  }
  return id;
}
