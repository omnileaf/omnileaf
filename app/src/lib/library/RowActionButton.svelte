<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    tooltip,
    onclick,
    children,
  }: {
    label: string;
    tooltip: string;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  aria-label={label}
  title={tooltip}
  class="flex shrink-0 items-center justify-center rounded-full text-muted block-touch-target inline-touch-target focus-visible:outline-2 focus-visible:outline-accent"
  {onclick}
>
  {@render children()}
</button>
