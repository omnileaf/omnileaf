<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    tooltip,
    disabled = false,
    onclick,
    children,
  }: {
    label: string;
    tooltip: string;
    disabled?: boolean;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  aria-label={label}
  title={tooltip}
  {disabled}
  class="flex shrink-0 items-center justify-center rounded-full text-muted block-touch-target inline-touch-target focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
  {onclick}
>
  {@render children()}
</button>
