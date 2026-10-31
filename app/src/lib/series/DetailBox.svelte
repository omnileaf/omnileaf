<script lang="ts">
  import type { Snippet } from "svelte";

  import { Card } from "#lib/components/ui/card/index.ts";

  let {
    isGrouped,
    isRelative = false,
    children,
  }: { isGrouped: boolean; isRelative?: boolean; children: Snippet } = $props();
</script>

{#if isGrouped}
  <Card class="px-lg py-md">{@render children()}</Card>
{:else if isRelative}
  <div class="relative">{@render children()}</div>
{:else}
  {@render children()}
{/if}
