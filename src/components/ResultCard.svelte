<script>
  import { iconForCategories } from "../lib/categories.js";
  import { formatDistance, formatHours, formatRating, mapsLinks, phoneHref, websiteLabel } from "../lib/format.js";

  let { place, state = "picking", imageFailed = $bindable(false) } = $props();

  const cuisine = $derived(
    Array.isArray(place.categories) && place.categories.length
      ? place.categories.slice(0, 3).join(" · ")
      : "Restaurant"
  );
  const cuisineIcon = $derived(iconForCategories(place.categories));
  const links = $derived(mapsLinks(place));
  const showImage = $derived(Boolean(place.imageUrl) && !imageFailed);
  const hours = $derived(formatHours(place.hours));
  const callLink = $derived(phoneHref(place.phone));
  const siteLabel = $derived(websiteLabel(place.url));
  const hasFacts = $derived(
    Boolean(place.address || place.phone || place.url || hours || place.delivery || place.wheelchair)
  );
</script>

{#if state !== "winner"}
  <div class="swipe-stamps" aria-hidden="true">
    <span class="swipe-stamp swipe-stamp-skip">Not today</span>
    <span class="swipe-stamp swipe-stamp-go">Let’s eat</span>
  </div>
{/if}
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
        <span class="result-icon" aria-hidden="true">{cuisineIcon}</span>
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
  {#if hasFacts}
    <dl class="result-facts">
      {#if place.address}
        <div class="result-fact">
          <dt>Address</dt>
          <dd>{place.address}</dd>
        </div>
      {/if}
      {#if place.phone}
        <div class="result-fact">
          <dt>Phone</dt>
          <dd>
            {#if callLink}
              <a class="result-fact-link" href={callLink}>{place.phone}</a>
            {:else}
              {place.phone}
            {/if}
          </dd>
        </div>
      {/if}
      {#if place.url}
        <div class="result-fact">
          <dt>Website</dt>
          <dd>
            <a class="result-fact-link" href={place.url} target="_blank" rel="noopener noreferrer">{siteLabel}</a>
          </dd>
        </div>
      {/if}
      {#if hours}
        <div class="result-fact">
          <dt>Hours</dt>
          <dd>{hours}</dd>
        </div>
      {/if}
      {#if place.delivery}
        <div class="result-fact">
          <dt>Delivery</dt>
          <dd>{place.delivery}</dd>
        </div>
      {/if}
      {#if place.wheelchair}
        <div class="result-fact">
          <dt>Wheelchair</dt>
          <dd>{place.wheelchair}</dd>
        </div>
      {/if}
    </dl>
  {/if}
  {#if state === "winner"}
    <div class="result-actions">
      <a class="btn btn-maps" href={links.google} target="_blank" rel="noopener noreferrer">Google Maps</a>
      <a class="btn btn-maps" href={links.apple} target="_blank" rel="noopener noreferrer">Apple Maps</a>
    </div>
  {/if}
</div>
