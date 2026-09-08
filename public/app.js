(() => {
  "use strict";

  const SESSION_COOKIE = "meal-spin-session-id";
  const SWIPE_THRESHOLD = 96;
  const CONFETTI_COLORS = ["#1faa8a", "#c8f542", "#f4f7f8", "#26c49f", "#14806a"];

  const els = {
    radius: document.getElementById("radius"),
    categoryInputs: Array.from(document.querySelectorAll('input[name="category"]')),
    locateBtn: document.getElementById("locate-btn"),
    locationStatus: document.getElementById("location-status"),
    latInput: document.getElementById("lat-input"),
    lngInput: document.getElementById("lng-input"),
    manualLocBtn: document.getElementById("manual-loc-btn"),
    spinBtn: document.getElementById("spin-btn"),
    errorMsg: document.getElementById("error-msg"),
    result: document.getElementById("result"),
    resultCard: document.getElementById("result-card"),
    swipeHint: document.getElementById("swipe-hint"),
    resultMedia: document.getElementById("result-media"),
    resultImage: document.getElementById("result-image"),
    resultInitial: document.getElementById("result-initial"),
    resultCuisine: document.getElementById("result-cuisine"),
    resultName: document.getElementById("result-name"),
    resultRating: document.getElementById("result-rating"),
    resultDistance: document.getElementById("result-distance"),
    resultPrice: document.getElementById("result-price"),
    resultActions: document.getElementById("result-actions"),
    mapsGoogle: document.getElementById("maps-google"),
    mapsApple: document.getElementById("maps-apple"),
    placeLink: document.getElementById("place-link"),
  };

  /** @type {{ lat: number, lng: number } | null} */
  let location = null;
  /** @type {object | null} */
  let currentBusiness = null;
  let spinning = false;
  /** @type {"picking" | "winner"} */
  let cardState = "picking";
  /** @type {{ pointerId: number, startX: number, startY: number } | null} */
  let drag = null;

  function getCookie(name) {
    const parts = `; ${document.cookie}`.split(`; ${name}=`);
    if (parts.length < 2) return "";
    return decodeURIComponent(parts.pop().split(";").shift() || "");
  }

  function setSessionCookie(id) {
    document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(id)}; path=/; SameSite=Lax`;
  }

  function getSessionId() {
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

  function selectedCategories() {
    return els.categoryInputs.filter((input) => input.checked).map((input) => input.value);
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    els.spinBtn.disabled = !location || spinning || selectedCategories().length === 0;
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

  function resetCardTransform() {
    els.resultCard.style.transform = "";
    els.resultCard.style.transition = "";
    els.resultCard.classList.remove("is-skip-hint", "is-go-hint");
  }

  function setPickingState() {
    cardState = "picking";
    els.resultCard.classList.add("is-picking");
    els.resultCard.classList.remove("is-winner");
    els.resultActions.hidden = true;
    els.placeLink.hidden = true;
    els.swipeHint.hidden = false;
    resetCardTransform();
  }

  function burstConfetti() {
    if (prefersReducedMotion()) return;

    const existing = document.querySelector(".confetti-root");
    if (existing) existing.remove();

    const root = document.createElement("div");
    root.className = "confetti-root";
    root.setAttribute("aria-hidden", "true");

    for (let i = 0; i < 36; i += 1) {
      const piece = document.createElement("span");
      const fromLeft = i % 2 === 0;
      piece.className = `confetti-piece ${fromLeft ? "from-left" : "from-right"}`;
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.top = `${8 + Math.random() * 84}vh`;
      piece.style.setProperty("--travel", `${42 + Math.random() * 38}vw`);
      piece.style.setProperty("--spin", `${(Math.random() * 720 - 360).toFixed(0)}deg`);
      piece.style.setProperty("--delay", `${(Math.random() * 0.18).toFixed(2)}s`);
      piece.style.width = `${6 + Math.random() * 8}px`;
      piece.style.height = `${8 + Math.random() * 10}px`;
      root.appendChild(piece);
    }

    document.body.appendChild(root);
    window.setTimeout(() => root.remove(), 1600);
  }

  function acceptWinner() {
    if (cardState !== "picking" || !currentBusiness) return;
    cardState = "winner";
    els.resultCard.classList.remove("is-picking", "is-skip-hint", "is-go-hint");
    els.resultCard.classList.add("is-winner");
    els.resultCard.style.transition = "transform 0.22s ease";
    els.resultCard.style.transform = "";
    els.swipeHint.hidden = true;
    els.resultActions.hidden = false;
    if (currentBusiness.url) {
      els.placeLink.hidden = false;
      els.placeLink.href = currentBusiness.url;
    } else {
      els.placeLink.hidden = true;
    }
    burstConfetti();
  }

  function applyDrag(deltaX) {
    const rotate = deltaX / 18;
    els.resultCard.style.transform = `translateX(${deltaX}px) rotate(${rotate}deg)`;
    els.resultCard.classList.toggle("is-skip-hint", deltaX < -28);
    els.resultCard.classList.toggle("is-go-hint", deltaX > 28);
  }

  function renderResult(biz) {
    currentBusiness = biz;
    els.result.hidden = false;
    setPickingState();

    els.resultName.textContent = biz.name || "Unknown place";
    els.resultCuisine.textContent =
      Array.isArray(biz.categories) && biz.categories.length
        ? biz.categories.slice(0, 3).join(" · ")
        : "Restaurant";
    if (biz.rating != null) {
      els.resultRating.hidden = false;
      els.resultRating.textContent = formatRating(biz.rating, biz.reviewCount);
    } else {
      els.resultRating.hidden = true;
      els.resultRating.textContent = "";
    }
    els.resultDistance.textContent = formatDistance(biz.distance);

    if (biz.price) {
      els.resultPrice.hidden = false;
      els.resultPrice.textContent = biz.price;
    } else {
      els.resultPrice.hidden = true;
    }

    const letter = (biz.name || "?").trim().charAt(0).toUpperCase() || "?";
    els.resultInitial.textContent = letter;
    els.resultMedia.hidden = false;

    const showLetter = () => {
      els.resultImage.hidden = true;
      els.resultImage.removeAttribute("src");
      els.resultInitial.hidden = false;
    };

    if (biz.imageUrl) {
      els.resultImage.onload = () => {
        els.resultImage.hidden = false;
        els.resultInitial.hidden = true;
      };
      els.resultImage.onerror = showLetter;
      els.resultImage.alt = biz.name || "Restaurant photo";
      els.resultImage.src = biz.imageUrl;
    } else {
      showLetter();
    }

    const query = biz.name || `${biz.lat},${biz.lng}`;
    const encodedQuery = encodeURIComponent(query);
    els.mapsGoogle.href = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
    if (biz.lat != null && biz.lng != null) {
      els.mapsApple.href = `https://maps.apple.com/?ll=${biz.lat},${biz.lng}&q=${encodeURIComponent(biz.name || query)}`;
    } else {
      els.mapsApple.href = `https://maps.apple.com/?q=${encodedQuery}`;
    }

    els.resultCard.focus({ preventScroll: true });
  }

  async function spin() {
    if (!location || spinning) return;
    if (selectedCategories().length === 0) {
      setError("Check at least one category, then spin.");
      return;
    }

    spinning = true;
    drag = null;
    updateSpinEnabled();
    els.spinBtn.classList.add("is-spinning");
    setError("");

    const params = new URLSearchParams({
      lat: String(location.lat),
      lng: String(location.lng),
      radiusMiles: els.radius.value,
      sessionId: getSessionId(),
      categories: selectedCategories().join(","),
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

  async function skipAndRespin() {
    if (!currentBusiness || !currentBusiness.id || spinning) return;

    spinning = true;
    updateSpinEnabled();
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
        throw new Error(data.error || "Could not skip this place.");
      }

      spinning = false;
      await spin();
    } catch (err) {
      setError(err.message || "Could not skip and re-spin.");
      spinning = false;
      updateSpinEnabled();
      setPickingState();
    }
  }

  function finishSwipe(deltaX) {
    if (cardState !== "picking") {
      resetCardTransform();
      return;
    }

    if (deltaX <= -SWIPE_THRESHOLD) {
      els.resultCard.style.transition = "transform 0.22s ease";
      els.resultCard.style.transform = `translateX(-140%) rotate(-18deg)`;
      window.setTimeout(() => {
        skipAndRespin();
      }, prefersReducedMotion() ? 0 : 180);
      return;
    }

    if (deltaX >= SWIPE_THRESHOLD) {
      els.resultCard.style.transition = "transform 0.22s ease";
      els.resultCard.style.transform = `translateX(140%) rotate(18deg)`;
      window.setTimeout(() => {
        acceptWinner();
      }, prefersReducedMotion() ? 0 : 180);
      return;
    }

    els.resultCard.style.transition = "transform 0.2s ease";
    els.resultCard.style.transform = "";
    els.resultCard.classList.remove("is-skip-hint", "is-go-hint");
  }

  function onPointerDown(event) {
    if (cardState !== "picking" || spinning) return;
    if (event.target.closest("a, button")) return;
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    els.resultCard.setPointerCapture(event.pointerId);
    els.resultCard.style.transition = "none";
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    applyDrag(event.clientX - drag.startX);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    drag = null;
    finishSwipe(deltaX);
  }

  function onCardKeyDown(event) {
    if (cardState !== "picking" || spinning) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      finishSwipe(-SWIPE_THRESHOLD);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      finishSwipe(SWIPE_THRESHOLD);
    }
  }

  els.locateBtn.addEventListener("click", requestGeolocation);
  els.manualLocBtn.addEventListener("click", applyManualLocation);
  els.spinBtn.addEventListener("click", spin);
  els.categoryInputs.forEach((input) => input.addEventListener("change", updateSpinEnabled));
  els.resultCard.addEventListener("pointerdown", onPointerDown);
  els.resultCard.addEventListener("pointermove", onPointerMove);
  els.resultCard.addEventListener("pointerup", onPointerUp);
  els.resultCard.addEventListener("pointercancel", onPointerUp);
  els.resultCard.addEventListener("keydown", onCardKeyDown);

  getSessionId();
  updateSpinEnabled();
})();
