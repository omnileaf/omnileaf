<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  import AppIcon from "./AppIcon.svelte";

  const SHELF_WIDTH = 304;
  const SHELF_THICKNESS = 8;
  const SHELF_TOP = 170;
  const SPINE_GAP = 8;
  const SPINE_INSET = 8;
  const SPINES = [
    { width: 22, height: 120, fill: "fill-spine-mint" },
    { width: 30, height: 150, fill: "fill-spine-green" },
    { width: 18, height: 100, fill: "fill-spine-gold" },
    { width: 26, height: 160, fill: "fill-spine-blue" },
    { width: 22, height: 130, fill: "fill-spine-paper" },
    { width: 34, height: 110, fill: "fill-spine-sand" },
    { width: 20, height: 150, fill: "fill-spine-teal" },
    { width: 28, height: 125, fill: "fill-spine-rose" },
    { width: 24, height: 140, fill: "fill-spine-mint" },
  ] as const;

  const spines = SPINES.map((spine, index) => ({
    ...spine,
    x:
      SPINE_INSET +
      SPINES.slice(0, index).reduce(
        (offset, before) => offset + before.width + SPINE_GAP,
        0,
      ),
  }));
</script>

<div
  aria-hidden="true"
  class="relative hidden shrink-0 flex-col overflow-hidden bg-panel p-2xl text-on-panel inline-first-launch-panel expanded:flex"
>
  <svg
    class="absolute inset-e-none inset-bs-none fill-panel-glow opacity-60 block-panel-glow-tall inline-panel-glow"
    viewBox="0 0 260 280"
  >
    <circle cx="240" cy="40" r="240" />
  </svg>
  <p class="relative flex items-center gap-md text-title font-bold">
    <AppIcon class="block-touch-target inline-touch-target" />
    {m.app_name()}
  </p>
  <svg
    class="mbs-auto"
    viewBox="0 0 {SHELF_WIDTH} {SHELF_TOP + SHELF_THICKNESS}"
  >
    {#each spines as spine (spine.x)}
      <rect
        x={spine.x}
        y={SHELF_TOP - spine.height}
        width={spine.width}
        height={spine.height}
        rx="4"
        class={spine.fill}
      />
    {/each}
    <rect
      y={SHELF_TOP}
      width={SHELF_WIDTH}
      height={SHELF_THICKNESS}
      rx="4"
      class="fill-on-panel"
    />
  </svg>
  <p class="mbs-3xl font-display text-title">{m.first_launch_tagline()}</p>
</div>
