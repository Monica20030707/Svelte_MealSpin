<script>
  import ResultCard from "./ResultCard.svelte";
  import Confetti from "./Confetti.svelte";

  let { place, burstId, onagain } = $props();
  let imageFailed = $state(false);
</script>

<div class="winner-overlay" role="dialog" aria-label="You're going here" aria-modal="true">
  <div class="winner-blur" aria-hidden="true"></div>
  <Confetti {burstId} linger={2400} extra={18} />
  <div class="winner-pop">
    <p class="winner-kicker">You’re going here</p>
    <div class="result-card is-winner">
      <ResultCard {place} state="winner" bind:imageFailed />
    </div>
    <button type="button" class="winner-again" onclick={onagain}>Go back, I changed my mind!</button>
  </div>
</div>
