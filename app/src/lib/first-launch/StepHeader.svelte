<script lang="ts">
  import type { Snippet } from "svelte";

  const SCALES = {
    display: "text-display",
    headline: "text-headline",
  } as const;

  let {
    scale,
    badge,
    children,
  }: {
    scale: keyof typeof SCALES;
    badge: Snippet;
    children: Snippet;
  } = $props();
</script>

<div class={["flex items-start gap-md", SCALES[scale]]}>
  <span class="flex shrink-0 items-center block-lh">{@render badge()}</span>
  <h1 tabindex="-1" class="font-bold">{@render children()}</h1>
</div>
