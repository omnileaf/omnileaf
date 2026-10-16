<script lang="ts">
  import type { Snippet } from "svelte";

  const SCALES = {
    welcome: "text-welcome-title",
    step: "text-headline",
  } as const;

  let {
    scale = "step",
    badge,
    children,
    lead,
  }: {
    scale?: keyof typeof SCALES;
    badge: Snippet;
    children: Snippet;
    lead: Snippet;
  } = $props();
</script>

<div class="flex flex-col gap-step-intro text-center">
  <div class="flex justify-center">{@render badge()}</div>
  <h1 tabindex="-1" class={["font-bold wrap-break-word", SCALES[scale]]}>
    {@render children()}
  </h1>
  <p class="text-step-body wrap-break-word text-muted">{@render lead()}</p>
</div>
