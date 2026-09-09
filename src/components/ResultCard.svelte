<script>
  import { formatDistance, formatRating, mapsLinks } from "../lib/format.js";

  let { place, state = "picking", imageFailed = $bindable(false) } = $props();

  const cuisine = $derived(
    Array.isArray(place.categories) && place.categories.length
      ? place.categories.slice(0, 3).join(" · ")
      : "Restaurant"
  );
  const letter = $derived((place.name || "?").trim().charAt(0).toUpperCase() || "?");
  const links = $derived(mapsLinks(place));
  const showImage = $derived(Boolean(place.imageUrl) && !imageFailed);
</script>

<div class="swipe-stamps" aria-hidden="true">
  <span class="swipe-stamp swipe-stamp-skip">Skip</span>
  <span class="swipe-stamp swipe-stamp-go">Let’s go</span>
</div>
<div class="result-body">
  <div class="result-heading">
    <div class="result-media">
      {#if showImage}
        <img
          src={place.imageUrl}
          alt={place.name || "Restaurant photo"}
          onerror={() => {
            imageFailed = true;
          }}
        />
      {:else}
        <span class="result-initial" aria-hidden="true">{letter}</span>
      {/if}
    </div>
    <div class="result-heading-text">
      <p class="result-cuisine">{cuisine}</p>
      <h2 class="result-name">{place.name || "Unknown place"}</h2>
    </div>
  </div>
  <div class="result-meta">
    {#if place.rating != null}
      <span class="meta-pill">{formatRating(place.rating, place.reviewCount)}</span>
    {/if}
    <span class="meta-pill">{formatDistance(place.distance)}</span>
    {#if place.price}
      <span class="meta-pill">{place.price}</span>
    {/if}
  </div>
  {#if state === "winner"}
    <div class="result-actions">
      <a class="btn btn-maps" href={links.google} target="_blank" rel="noopener noreferrer">Google Maps</a>
      <a class="btn btn-maps" href={links.apple} target="_blank" rel="noopener noreferrer">Apple Maps</a>
    </div>
    {#if place.url}
      <a class="place-link" href={place.url} target="_blank" rel="noopener noreferrer">Website</a>
    {/if}
  {/if}
</div>
