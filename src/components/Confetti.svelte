<script>
  import { prefersReducedMotion } from "../lib/format.js";

  const COLORS = ["#1faa8a", "#c8f542", "#f4f7f8", "#26c49f", "#14806a"];

  let { burstId = 0 } = $props();
  let pieces = $state([]);

  $effect(() => {
    if (!burstId || prefersReducedMotion()) {
      pieces = [];
      return;
    }

    pieces = Array.from({ length: 36 }, (_, i) => ({
      id: `${burstId}-${i}`,
      fromLeft: i % 2 === 0,
      color: COLORS[i % COLORS.length],
      travel: `${48 + Math.random() * 42}vh`,
      drift: `${8 + Math.random() * 28}vw`,
      spin: `${(Math.random() * 720 - 360).toFixed(0)}deg`,
      delay: `${(Math.random() * 0.18).toFixed(2)}s`,
      width: `${6 + Math.random() * 8}px`,
      height: `${8 + Math.random() * 10}px`,
    }));

    const timer = window.setTimeout(() => {
      pieces = [];
    }, 1600);
    return () => window.clearTimeout(timer);
  });
</script>

{#if pieces.length}
  <div class="confetti-root" aria-hidden="true">
    {#each pieces as piece (piece.id)}
      <span
        class="confetti-piece"
        class:from-left={piece.fromLeft}
        class:from-right={!piece.fromLeft}
        style:background={piece.color}
        style:width={piece.width}
        style:height={piece.height}
        style:--travel={piece.travel}
        style:--drift={piece.drift}
        style:--spin={piece.spin}
        style:--delay={piece.delay}
      ></span>
    {/each}
  </div>
{/if}
