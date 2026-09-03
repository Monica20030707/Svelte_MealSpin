(() => {
  "use strict";

  const SESSION_KEY = "meal-spin-session-id";

  const els = {
    radius: document.getElementById("radius"),
    locateBtn: document.getElementById("locate-btn"),
    locationStatus: document.getElementById("location-status"),
    latInput: document.getElementById("lat-input"),
    lngInput: document.getElementById("lng-input"),
    manualLocBtn: document.getElementById("manual-loc-btn"),
    spinBtn: document.getElementById("spin-btn"),
    errorMsg: document.getElementById("error-msg"),
    result: document.getElementById("result"),
    resultMedia: document.getElementById("result-media"),
    resultImage: document.getElementById("result-image"),
    resultCuisine: document.getElementById("result-cuisine"),
    resultName: document.getElementById("result-name"),
    resultRating: document.getElementById("result-rating"),
    resultDistance: document.getElementById("result-distance"),
    resultPrice: document.getElementById("result-price"),
    resultAddress: document.getElementById("result-address"),
    mapsGoogle: document.getElementById("maps-google"),
    mapsApple: document.getElementById("maps-apple"),
    banBtn: document.getElementById("ban-btn"),
    yelpLink: document.getElementById("yelp-link"),
  };

  /** @type {{ lat: number, lng: number } | null} */
  let location = null;
  /** @type {object | null} */
  let currentBusiness = null;
  let spinning = false;

  function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `ms-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function setError(message) {
    if (!message) {
      els.errorMsg.hidden = true;
      els.errorMsg.textContent = "";
      return;
    }
    els.errorMsg.hidden = false;
    els.errorMsg.textContent = message;
  }

  function metersToMiles(meters) {
    return meters / 1609.344;
  }

  function formatDistance(meters) {
    if (typeof meters !== "number" || Number.isNaN(meters)) return "Distance unknown";
    const miles = metersToMiles(meters);
    if (miles < 0.1) return "< 0.1 mi";
    return `${miles.toFixed(1)} mi away`;
  }

  function formatRating(rating, reviewCount) {
    if (rating == null) return "No rating";
    const stars = Number(rating).toFixed(1);
    if (reviewCount != null) return `${stars} ★ · ${reviewCount} reviews`;
    return `${stars} ★`;
  }

  function updateSpinEnabled() {
    els.spinBtn.disabled = !location || spinning;
  }

  function setLocation(lat, lng, label) {
    location = { lat, lng };
    els.latInput.value = String(lat);
    els.lngInput.value = String(lng);
    els.locationStatus.textContent = label || `Location set: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    els.locationStatus.classList.add("is-ready");
    setError("");
    updateSpinEnabled();
  }

  function requestGeolocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser. Enter coordinates manually.");
      return;
    }

    els.locateBtn.disabled = true;
    els.locationStatus.textContent = "Finding your location…";
    els.locationStatus.classList.remove("is-ready");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        els.locateBtn.disabled = false;
        setLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          `Using your location (±${Math.round(pos.coords.accuracy)} m)`
        );
      },
      (err) => {
        els.locateBtn.disabled = false;
        els.locationStatus.textContent = "Location not set yet.";
        const hints = {
          1: "Location permission denied. Allow access or enter coordinates manually.",
          2: "Location unavailable. Try again or enter coordinates manually.",
          3: "Location request timed out. Try again or enter coordinates manually.",
        };
        setError(hints[err.code] || "Could not get your location. Enter coordinates manually.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  function applyManualLocation() {
    const lat = Number(els.latInput.value);
    const lng = Number(els.lngInput.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError("Enter valid numeric latitude and longitude.");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError("Latitude must be between -90 and 90; longitude between -180 and 180.");
      return;
    }
    setLocation(lat, lng, `Manual location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  }

  function renderResult(biz) {
    currentBusiness = biz;
    els.result.hidden = false;

    els.resultName.textContent = biz.name || "Unknown place";
    els.resultCuisine.textContent =
      Array.isArray(biz.categories) && biz.categories.length
        ? biz.categories.slice(0, 3).join(" · ")
        : "Restaurant";
    els.resultRating.textContent = formatRating(biz.rating, biz.reviewCount);
    els.resultDistance.textContent = formatDistance(biz.distance);
    els.resultAddress.textContent = biz.address || "Address unavailable";

    if (biz.price) {
      els.resultPrice.hidden = false;
      els.resultPrice.textContent = biz.price;
    } else {
      els.resultPrice.hidden = true;
    }

    if (biz.imageUrl) {
      els.resultMedia.hidden = false;
      els.resultImage.src = biz.imageUrl;
      els.resultImage.alt = biz.name || "Restaurant photo";
    } else {
      els.resultMedia.hidden = true;
      els.resultImage.removeAttribute("src");
    }

    if (biz.lat != null && biz.lng != null) {
      const dest = `${biz.lat},${biz.lng}`;
      els.mapsGoogle.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
      els.mapsApple.href = `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`;
    } else {
      const q = encodeURIComponent(biz.address || biz.name || "");
      els.mapsGoogle.href = `https://www.google.com/maps/search/?api=1&query=${q}`;
      els.mapsApple.href = `https://maps.apple.com/?q=${q}`;
    }

    if (biz.url) {
      els.yelpLink.hidden = false;
      els.yelpLink.href = biz.url;
    } else {
      els.yelpLink.hidden = true;
    }
  }

  async function spin() {
    if (!location || spinning) return;

    spinning = true;
    updateSpinEnabled();
    els.spinBtn.classList.add("is-spinning");
    setError("");

    const params = new URLSearchParams({
      lat: String(location.lat),
      lng: String(location.lng),
      radiusMiles: els.radius.value,
      sessionId: getSessionId(),
    });

    try {
      const res = await fetch(`/api/spin?${params}`, {
        headers: { "X-Session-Id": getSessionId() },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Spin failed (${res.status})`);
      }

      renderResult(data);
    } catch (err) {
      setError(err.message || "Something went wrong while spinning.");
    } finally {
      spinning = false;
      els.spinBtn.classList.remove("is-spinning");
      updateSpinEnabled();
    }
  }

  async function banAndRespin() {
    if (!currentBusiness || !currentBusiness.id || spinning) return;

    spinning = true;
    updateSpinEnabled();
    els.banBtn.disabled = true;
    setError("");

    try {
      const res = await fetch("/api/blacklist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": getSessionId(),
        },
        body: JSON.stringify({
          sessionId: getSessionId(),
          businessId: currentBusiness.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not ban this place.");
      }

      spinning = false;
      await spin();
    } catch (err) {
      setError(err.message || "Could not ban and re-spin.");
      spinning = false;
      updateSpinEnabled();
    } finally {
      els.banBtn.disabled = false;
    }
  }

  els.locateBtn.addEventListener("click", requestGeolocation);
  els.manualLocBtn.addEventListener("click", applyManualLocation);
  els.spinBtn.addEventListener("click", spin);
  els.banBtn.addEventListener("click", banAndRespin);

  getSessionId();
  updateSpinEnabled();
})();
