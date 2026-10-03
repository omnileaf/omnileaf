<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  import AppIcon from "./AppIcon.svelte";

  const SHELF_WIDTH = 304;
  const SHELF_THICKNESS = 8;
  const SHELF_TOP = 170;
  const SPINE_GAP = 8;
  const SPINE_INSET = 8;
  const SPINES = [
    { width: 22, height: 120, colour: "#ddebe2" },
    { width: 30, height: 150, colour: "#7fcb9d" },
    { width: 18, height: 100, colour: "#c9a24d" },
    { width: 26, height: 160, colour: "#a9c4e6" },
    { width: 22, height: 130, colour: "#f1ede4" },
    { width: 34, height: 110, colour: "#e8c98c" },
    { width: 20, height: 150, colour: "#9fdccf" },
    { width: 28, height: 125, colour: "#f0b8c4" },
    { width: 24, height: 140, colour: "#ddebe2" },
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
    class="absolute inset-e-none inset-bs-none fill-panel-glow opacity-60"
    width="260"
    height="280"
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
        fill={spine.colour}
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
