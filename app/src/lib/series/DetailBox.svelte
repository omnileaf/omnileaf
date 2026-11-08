<script lang="ts">
  import type { Snippet } from "svelte";

  import { Card } from "#lib/components/ui/card/index.ts";

  let {
    isGrouped,
    cardClass = "px-lg py-md",
    children,
  }: {
    isGrouped: boolean;
    cardClass?: string | undefined;
    children: Snippet;
  } = $props();
</script>

{#if isGrouped}
  <Card class={cardClass}>{@render children()}</Card>
{:else}
  {@render children()}
{/if}
