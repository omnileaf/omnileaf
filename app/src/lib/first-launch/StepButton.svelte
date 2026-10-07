<script lang="ts">
  import type { Snippet } from "svelte";

  const KINDS = {
    primary:
      "bg-accent font-bold text-on-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-pressed touch:min-block-touch-button",
    quiet:
      "font-semibold text-accent enabled:hover:bg-hover enabled:active:bg-pressed",
    outlined:
      "border border-border font-semibold enabled:hover:bg-hover enabled:active:bg-pressed",
  } as const;

  let {
    kind,
    disabled = false,
    onclick,
    children,
  }: {
    kind: keyof typeof KINDS;
    disabled?: boolean;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  {disabled}
  class={[
    "flex items-center justify-center gap-sm px-xl transition-control min-block-touch-target disabled:opacity-60 ios:rounded-ios-button android:rounded-full desktop:rounded-button desktop:text-label desktop:min-block-pointer-target",
    KINDS[kind],
  ]}
  {onclick}
>
  {@render children()}
</button>
