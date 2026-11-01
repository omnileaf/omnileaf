<script lang="ts">
  import type { Snippet } from "svelte";

  import { currentPlatform } from "#lib/page/platform.ts";

  import { coverTileLook } from "./cover-tile";

  let { isOn, children }: { isOn: boolean; children: Snippet } = $props();

  const look = coverTileLook(currentPlatform()).notConnected;
</script>

{#if isOn && look !== undefined}
  <span data-slot="cover-dim" class={["absolute inset-none", look.dim]}>
    {@render children()}
  </span>
{:else}
  {@render children()}
{/if}
