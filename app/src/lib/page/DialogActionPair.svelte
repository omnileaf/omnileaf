<script lang="ts">
  import type { Snippet } from "svelte";

  import { alertLook } from "#lib/components/ui/dialog/alert-look.ts";

  import { currentPlatform } from "./platform";

  let { cancel, confirm }: { cancel: Snippet | undefined; confirm: Snippet } =
    $props();

  const order = alertLook(currentPlatform()).actionOrder;
</script>

{#each order as action (action)}
  {#if action === "cancel"}
    {@render cancel?.()}
  {:else}
    {@render confirm()}
  {/if}
{/each}
