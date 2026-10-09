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
    onclick: (event: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  aria-label={label}
  title={tooltip}
  {disabled}
  class="flex shrink-0 items-center justify-center rounded-full text-muted transition-control block-touch-target inline-touch-target before:absolute before:rounded-full before:transition-control before:block-pointer-target before:inline-pointer-target focus-visible:outline-2 focus-visible:outline-accent enabled:hover:text-foreground enabled:hover:before:bg-hover enabled:active:text-foreground enabled:active:before:bg-pressed disabled:opacity-60"
  {onclick}
>
  {@render children()}
</button>
