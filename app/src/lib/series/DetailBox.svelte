<script lang="ts">
  import type { Snippet } from "svelte";

  import { Card } from "#lib/components/ui/card/index.ts";

  let { isGrouped, children }: { isGrouped: boolean; children: Snippet } =
    $props();
</script>

{#if isGrouped}
  <Card class="px-lg py-md">{@render children()}</Card>
{:else}
  {@render children()}
{/if}
