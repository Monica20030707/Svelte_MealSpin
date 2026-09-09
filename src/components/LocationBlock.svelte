<script>
  let {
    status = "Location not set yet.",
    ready = false,
    locating = false,
    lat = $bindable(""),
    lng = $bindable(""),
    onlocate,
    onmanual,
  } = $props();
</script>

<div class="location-block">
  <button type="button" class="btn btn-secondary" disabled={locating} onclick={onlocate}>
    Use my location
  </button>
  <p class="status" class:is-ready={ready} role="status">{status}</p>
  <details class="manual-loc">
    <summary>Enter coordinates manually</summary>
    <div class="manual-fields">
      <label>
        Latitude
        <input type="number" step="any" placeholder="37.7749" inputmode="decimal" bind:value={lat} />
      </label>
      <label>
        Longitude
        <input type="number" step="any" placeholder="-122.4194" inputmode="decimal" bind:value={lng} />
      </label>
      <button type="button" class="btn btn-secondary" onclick={onmanual}>Set location</button>
    </div>
  </details>
</div>
