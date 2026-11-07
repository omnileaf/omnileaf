<script lang="ts">
  import SmartFeaturesSection from "./SmartFeaturesSection.svelte";
  import { SmartFeatures, setSmartFeatures } from "./smart-features.svelte.ts";

  let { heading, size }: { heading: "h2" | "h3"; size?: "small" | "regular" } =
    $props();

  setSmartFeatures(new SmartFeatures(undefined));
</script>

{#if size === undefined}
  <SmartFeaturesSection {heading} />
{:else}
  <SmartFeaturesSection {heading} {size} />
{/if}
