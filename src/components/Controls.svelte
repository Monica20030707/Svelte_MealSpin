<script>
  import CategoryPicker from "./CategoryPicker.svelte";
  import LocationBlock from "./LocationBlock.svelte";

  let {
    radius = $bindable("10"),
    selected = $bindable([]),
    locationStatus,
    locationReady,
    locating,
    lat = $bindable(""),
    lng = $bindable(""),
    spinning,
    canSpin,
    updateMode = false,
    onlocate,
    onmanual,
    onspin,
  } = $props();
</script>

<section class="controls" aria-label="Location and spin controls">
  <div class="field-row">
    <label for="radius">Radius</label>
    <select id="radius" name="radius" bind:value={radius}>
      <option value="5">5 miles</option>
      <option value="10">10 miles</option>
      <option value="15">15 miles</option>
      <option value="25">25 miles</option>
    </select>
  </div>

  <CategoryPicker bind:selected />

  <LocationBlock
    status={locationStatus}
    ready={locationReady}
    {locating}
    bind:lat
    bind:lng
    {onlocate}
    {onmanual}
  />

  <button type="button" class="btn btn-primary" class:is-spinning={spinning} disabled={!canSpin} onclick={onspin}>
    <span aria-hidden="true">{updateMode ? "✨" : "🔮"}</span>
    {updateMode ? "Update" : "Show me the place"}
  </button>
</section>
