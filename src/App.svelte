<script>
  import Brand from "./components/Brand.svelte";
  import Controls from "./components/Controls.svelte";
  import CardStack from "./components/CardStack.svelte";
  import Confetti from "./components/Confetti.svelte";
  import { ALL_CATEGORY_IDS } from "./lib/categories.js";
  import { fetchSpin, skipPlace } from "./lib/api.js";
  import { getSessionId } from "./lib/session.js";

  let radius = $state("10");
  let selected = $state([...ALL_CATEGORY_IDS]);
  let coords = $state(null);
  let lat = $state("");
  let lng = $state("");
  let locationStatus = $state("Location not set yet.");
  let locationReady = $state(false);
  let locating = $state(false);
  let spinning = $state(false);
  let error = $state("");
  let place = $state(null);
  let cardState = $state("picking");
  let confettiBurst = $state(0);

  const canSpin = $derived(Boolean(coords) && !spinning && selected.length > 0);

  getSessionId();

  function setError(message) {
    error = message || "";
  }

  function setLocation(nextLat, nextLng, label) {
    coords = { lat: nextLat, lng: nextLng };
    lat = String(nextLat);
    lng = String(nextLng);
    locationStatus = label || `Location set: ${nextLat.toFixed(4)}, ${nextLng.toFixed(4)}`;
    locationReady = true;
    setError("");
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser. Enter coordinates manually.");
      return;
    }

    locating = true;
    locationStatus = "Finding your location…";
    locationReady = false;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        setLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          `Using your location (±${Math.round(pos.coords.accuracy)} m)`
        );
      },
      (err) => {
        locating = false;
        locationStatus = "Location not set yet.";
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

  function applyManual() {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
      setError("Enter valid numeric latitude and longitude.");
      return;
    }
    if (nextLat < -90 || nextLat > 90 || nextLng < -180 || nextLng > 180) {
      setError("Latitude must be between -90 and 90; longitude between -180 and 180.");
      return;
    }
    setLocation(nextLat, nextLng, `Manual location: ${nextLat.toFixed(4)}, ${nextLng.toFixed(4)}`);
  }

  async function spin() {
    if (!coords || spinning) return;
    if (selected.length === 0) {
      setError("Check at least one category, then spin.");
      return;
    }

    spinning = true;
    setError("");

    try {
      const next = await fetchSpin({
        lat: coords.lat,
        lng: coords.lng,
        radiusMiles: radius,
        categories: selected,
      });
      place = next;
      cardState = "picking";
    } catch (err) {
      setError(err.message || "Something went wrong while spinning.");
    } finally {
      spinning = false;
    }
  }

  async function skipAndRespin() {
    if (!place?.id || spinning) return;
    spinning = true;
    setError("");
    try {
      await skipPlace(place.id);
      spinning = false;
      await spin();
    } catch (err) {
      setError(err.message || "Could not skip and re-spin.");
      spinning = false;
      cardState = "picking";
    }
  }

  function acceptWinner() {
    if (cardState !== "picking" || !place) return;
    cardState = "winner";
    confettiBurst += 1;
  }
</script>

<div class="bg-atmosphere" aria-hidden="true"></div>

<main class="shell">
  <Brand />
  <Controls
    bind:radius
    bind:selected
    bind:lat
    bind:lng
    {locationStatus}
    {locationReady}
    {locating}
    {spinning}
    {canSpin}
    onlocate={locate}
    onmanual={applyManual}
    onspin={spin}
  />

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if place}
    <CardStack {place} mode={cardState} {spinning} onskip={skipAndRespin} onaccept={acceptWinner} />
  {/if}
</main>

<Confetti burstId={confettiBurst} />
