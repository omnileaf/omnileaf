<script lang="ts">
  import type { Snippet } from "svelte";

  import { Card } from "#lib/components/ui/card/index.ts";

  let {
    isGrouped,
    isRelative = false,
    cardClass = "px-lg py-md",
    children,
  }: {
    isGrouped: boolean;
    isRelative?: boolean;
    cardClass?: string | undefined;
    children: Snippet;
  } = $props();
</script>

{#if isGrouped}
  <Card class={cardClass}>{@render children()}</Card>
{:else if isRelative}
  <div class="relative">{@render children()}</div>
{:else}
  {@render children()}
{/if}
