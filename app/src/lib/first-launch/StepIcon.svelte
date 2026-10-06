<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    tone = "soft",
    children,
  }: { tone?: "soft" | "strong"; children: Snippet } = $props();
</script>

<span
  class={[
    "flex items-center justify-center block-hero-icon inline-hero-icon",
    tone === "soft"
      ? "rounded-sheet bg-accent-soft"
      : "rounded-full bg-accent text-on-accent",
  ]}
>
  {@render children()}
</span>
