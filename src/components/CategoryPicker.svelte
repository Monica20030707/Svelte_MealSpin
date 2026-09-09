<script>
  import { CUISINES, PLACE_TYPES } from "../lib/categories.js";

  let { selected = $bindable([]) } = $props();

  function toggle(id, checked) {
    selected = checked
      ? [...new Set([...selected, id])]
      : selected.filter((item) => item !== id);
  }
</script>

<fieldset class="category-fieldset">
  <legend>What should we recommend?</legend>
  <p class="category-group-label">Place type</p>
  <div class="category-grid">
    {#each PLACE_TYPES as item (item.id)}
      <label class="category-chip">
        <input
          type="checkbox"
          name="category"
          value={item.id}
          checked={selected.includes(item.id)}
          onchange={(event) => toggle(item.id, event.currentTarget.checked)}
        />
        <span aria-hidden="true">{item.icon}</span>
        {item.label}
      </label>
    {/each}
  </div>
  <p class="category-group-label">Cuisine</p>
  <div class="category-grid">
    {#each CUISINES as item (item.id)}
      <label class="category-chip">
        <input
          type="checkbox"
          name="category"
          value={item.id}
          checked={selected.includes(item.id)}
          onchange={(event) => toggle(item.id, event.currentTarget.checked)}
        />
        <span aria-hidden="true">{item.icon}</span>
        {item.label}
      </label>
    {/each}
  </div>
</fieldset>
