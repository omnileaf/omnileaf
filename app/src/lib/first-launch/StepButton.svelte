<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    kind,
    disabled = false,
    onclick,
    children,
  }: {
    kind: "primary" | "quiet";
    disabled?: boolean;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  {disabled}
  class={[
    "flex items-center justify-center gap-sm rounded-full px-xl min-block-touch-target disabled:opacity-60 medium:rounded-control",
    kind === "primary"
      ? "bg-accent font-bold text-on-accent"
      : "font-semibold text-accent",
  ]}
  {onclick}
>
  {@render children()}
</button>
