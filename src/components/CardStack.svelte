<script>
  import ResultCard from "./ResultCard.svelte";
  import { prefersReducedMotion } from "../lib/format.js";

  let { place, mode = "picking", spinning = false, onskip, onaccept } = $props();

  const SWIPE_DISTANCE = 96;
  const SWIPE_CONFIDENCE = 10000;
  const BLANKS = [1, 2, 3];

  let cardEl = $state(null);
  let hint = $state("");
  let imageFailed = $state(false);
  let drag = $state(null);
  let sendingBack = $state(false);

  $effect(() => {
    place?.id;
    imageFailed = false;
    hint = "";
    sendingBack = false;
    resetTransform();
  });

  function swipePower(offset, velocity) {
    return Math.abs(offset) * velocity;
  }

  function resetTransform() {
    if (!cardEl) return;
    cardEl.style.transform = "";
    cardEl.style.transition = "";
  }

  function applyDrag(deltaX) {
    if (!cardEl) return;
    cardEl.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 18}deg)`;
    hint = deltaX < -28 ? "skip" : deltaX > 28 ? "go" : "";
  }

  function finishSwipe(offsetX, velocityX = 0) {
    if (mode !== "picking" || sendingBack) {
      resetTransform();
      return;
    }

    const power = swipePower(offsetX, velocityX);
    const skip = offsetX <= -SWIPE_DISTANCE || power < -SWIPE_CONFIDENCE;
    const accept = offsetX >= SWIPE_DISTANCE || power > SWIPE_CONFIDENCE;

    if (skip) {
      sendingBack = true;
      hint = "";
      if (cardEl) {
        cardEl.style.transition = "";
        cardEl.style.transform = "";
      }
      window.setTimeout(() => onskip?.(), prefersReducedMotion() ? 0 : 420);
      return;
    }

    if (accept) {
      onaccept?.();
      return;
    }

    if (cardEl) {
      cardEl.style.transition = "transform 0.2s ease";
      cardEl.style.transform = "";
    }
    hint = "";
  }

  function onPointerDown(event) {
    if (mode !== "picking" || spinning || sendingBack) return;
    if (event.target.closest("a, button")) return;
    drag = { pointerId: event.pointerId, startX: event.clientX, lastX: event.clientX, lastT: Date.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (cardEl) cardEl.style.transition = "none";
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = { ...drag, lastX: event.clientX, lastT: Date.now() };
    applyDrag(event.clientX - drag.startX);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const offsetX = event.clientX - drag.startX;
    const velocityX = ((event.clientX - drag.lastX) / Math.max(Date.now() - drag.lastT, 16)) * 1000;
    drag = null;
    finishSwipe(offsetX, velocityX);
  }

  function onKeyDown(event) {
    if (mode !== "picking" || spinning || sendingBack) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      finishSwipe(-SWIPE_DISTANCE, -800);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      finishSwipe(SWIPE_DISTANCE, 800);
    }
  }
</script>

<section class="result" class:is-winner={mode === "winner"} aria-live="polite">
  {#if mode === "picking"}
    <p class="swipe-hint">← nah · yum →</p>
  {/if}

  <div class="card-stack" class:is-cycling={sendingBack}>
    {#each BLANKS as depth (depth)}
      <div class="blank-card blank-{depth}" class:is-hidden={mode === "winner"} aria-hidden="true"></div>
    {/each}

    {#key place.id}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
      <div
        bind:this={cardEl}
        class="result-card"
        class:is-picking={mode === "picking"}
        class:is-winner={mode === "winner"}
        class:is-sending-back={sendingBack}
        class:is-skip-hint={hint === "skip"}
        class:is-go-hint={hint === "go"}
        role="group"
        tabindex={mode === "picking" ? 0 : -1}
        aria-label="Spin result. Swipe left to skip, right to pick."
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        onkeydown={onKeyDown}
      >
        <ResultCard {place} state={mode} bind:imageFailed />
      </div>
    {/key}
  </div>
</section>
