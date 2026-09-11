<script>
  import Brand from "./components/Brand.svelte";
  import Controls from "./components/Controls.svelte";
  import CardStack from "./components/CardStack.svelte";
  import WinnerScreen from "./components/WinnerScreen.svelte";
  import { ALL_CATEGORY_IDS, foodTypesFromCategories, shouldAvoidRepeatType } from "./lib/categories.js";
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
  let locationWatchId = $state(null);
  let spinning = $state(false);
  let error = $state("");
  let place = $state(null);
  let cardState = $state("picking");
  let confettiBurst = $state(0);
  let lastSpinKey = $state("");

  const canSpin = $derived(Boolean(coords) && !spinning && selected.length > 0);
  const filtersDirty = $derived(Boolean(place) && lastSpinKey !== "" && spinKey() !== lastSpinKey);

  function spinKey() {
    const categoryKey = [...selected].sort().join(",");
    const latKey = coords ? coords.lat.toFixed(4) : "";
    const lngKey = coords ? coords.lng.toFixed(4) : "";
    return `${radius}|${categoryKey}|${latKey}|${lngKey}`;
  }

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

  function stopLocationWatch() {
    if (locationWatchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchId);
    }
    locationWatchId = null;
  }

  function formatAccuracy(meters) {
    if (!Number.isFinite(meters)) return "";
    if (meters >= 1609) return `±${(meters / 1609.344).toFixed(1)} mi`;
    return `±${Math.round(meters)} m`;
  }

  function applyFix(pos) {
    const accuracy = pos.coords.accuracy;
    const rough = accuracy > 1609;
    setLocation(
      pos.coords.latitude,
      pos.coords.longitude,
      rough
        ? `Location is approximate (${formatAccuracy(accuracy)}). Enter coordinates if this looks off.`
        : `Using your location (${formatAccuracy(accuracy)})`
    );
    if (rough) {
      setError("The browser gave a city-level pin, not GPS. That’s often ~10–20 miles off on Wi‑Fi/desktop. Use a phone with location on, or enter coordinates.");
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser. Enter coordinates manually.");
      return;
    }

    stopLocationWatch();
    locating = true;
    locationStatus = "Finding a more precise location…";
    locationReady = false;
    setError("");

    let best = null;
    const options = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

    const finish = () => {
      stopLocationWatch();
      locating = false;
      if (best) {
        applyFix(best);
        return;
      }
      locationStatus = "Location not set yet.";
    };

    const onError = (err) => {
      if (best) {
        finish();
        return;
      }
      stopLocationWatch();
      locating = false;
      locationStatus = "Location not set yet.";
      const hints = {
        1: "Location permission denied. Allow access or enter coordinates manually.",
        2: "Location unavailable. Try again or enter coordinates manually.",
        3: "Location request timed out. Try again or enter coordinates manually.",
      };
      setError(hints[err.code] || "Could not get your location. Enter coordinates manually.");
    };

    locationWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) {
          best = pos;
        }
        if (pos.coords.accuracy <= 80) {
          finish();
        }
      },
      onError,
      options
    );

    window.setTimeout(() => {
      if (locating) finish();
    }, 8000);
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

  async function spin(avoidTypes = []) {
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
        avoidTypes,
      });
      place = next;
      cardState = "picking";
      lastSpinKey = spinKey();
    } catch (err) {
      setError(err.message || "Something went wrong while spinning.");
    } finally {
      spinning = false;
    }
  }

  async function skipAndRespin() {
    if (!place?.id || spinning) return;
    const avoidTypes = shouldAvoidRepeatType(selected)
      ? foodTypesFromCategories(place.categories)
      : [];
    spinning = true;
    setError("");
    try {
      await skipPlace(place.id);
      spinning = false;
      await spin(avoidTypes);
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

  function keepLooking() {
    cardState = "picking";
  }

  const SPRINKLES = [
    { icon: "🍕", top: "5%", left: "3%", size: "5.1rem", delay: "0s" },
    { icon: "🍜", top: "12%", left: "22%", size: "4.4rem", delay: "0.2s" },
    { icon: "🌮", top: "8%", left: "72%", size: "4.8rem", delay: "0.4s" },
    { icon: "🍣", top: "16%", left: "88%", size: "4.5rem", delay: "0.1s" },
    { icon: "🍔", top: "28%", left: "11%", size: "4.7rem", delay: "0.35s" },
    { icon: "🥗", top: "34%", left: "80%", size: "4.3rem", delay: "0.55s" },
    { icon: "🍩", top: "42%", left: "2%", size: "4.6rem", delay: "0.15s" },
    { icon: "🥟", top: "48%", left: "91%", size: "4.4rem", delay: "0.45s" },
    { icon: "🍦", top: "58%", left: "10%", size: "4.5rem", delay: "0.25s" },
    { icon: "🍟", top: "63%", left: "78%", size: "4.8rem", delay: "0.05s" },
    { icon: "🍛", top: "76%", left: "4%", size: "4.6rem", delay: "0.5s" },
    { icon: "🍱", top: "76%", left: "86%", size: "4.3rem", delay: "0.3s" },
    { icon: "🥑", top: "84%", left: "18%", size: "4.5rem", delay: "0.2s" },
    { icon: "🍪", top: "88%", left: "62%", size: "4.4rem", delay: "0.4s" },
    { icon: "🥐", top: "22%", left: "48%", size: "4.2rem", delay: "0.6s" },
    { icon: "🍉", top: "68%", left: "42%", size: "4.3rem", delay: "0.18s" },
    { icon: "🍤", top: "38%", left: "58%", size: "4.1rem", delay: "0.38s" },
    { icon: "🍇", top: "52%", left: "28%", size: "4.2rem", delay: "0.48s" },
  ];
</script>

<div class="bg-atmosphere" aria-hidden="true"></div>
<div class="food-sprinkles" aria-hidden="true">
  {#each SPRINKLES as bit, i (i)}
    <span
      class:wobble-b={i % 2 === 1}
      style:top={bit.top}
      style:left={bit.left}
      style:font-size={bit.size}
      style:animation-delay={bit.delay}
    >{bit.icon}</span>
  {/each}
</div>

<main class="shell" class:is-picking={Boolean(place)} class:is-dimmed={cardState === "winner"}>
  {#if !place}
    <Brand />
  {/if}

  <div class="workspace">
    <aside class="options">
      {#if place}
        <p class="sidebar-mark">Meal Spin</p>
      {/if}
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
        updateMode={filtersDirty}
        onlocate={locate}
        onmanual={applyManual}
        onspin={spin}
      />
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
    </aside>

    {#if place}
      <section class="stage" aria-label="Restaurant deck">
        <CardStack {place} mode="picking" {spinning} onskip={skipAndRespin} onaccept={acceptWinner} />
      </section>
    {/if}
  </div>
</main>

{#if cardState === "winner" && place}
  <WinnerScreen {place} burstId={confettiBurst} onagain={keepLooking} />
{/if}
