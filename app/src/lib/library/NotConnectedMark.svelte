<script lang="ts">
  import { Unplug } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { coverTileLook } from "./cover-tile";

  const MARK_ICON_SIZE = 12;

  let { class: className }: { class?: ClassValue } = $props();

  const look = coverTileLook(currentPlatform()).notConnected;
</script>

{#if look !== undefined}
  <span data-slot="not-connected" class={[look.mark, className]}>
    <Unplug size={MARK_ICON_SIZE} aria-hidden="true" class="shrink-0" />
    <span class="truncate">{m.library_not_connected()}</span>
  </span>
{/if}
