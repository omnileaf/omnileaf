<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  import type { LinkOpening } from "./link-opening.svelte";
  import type { DetailsCopying } from "#lib/copying/details-copying.svelte.ts";

  let { copying, opening }: { copying: DetailsCopying; opening: LinkOpening } =
    $props();
</script>

<div role="alert" class="text-footnote touch:max-medium:px-xs">
  {#if copying.outcome === "failed"}
    <p class="mbs-sm">{m.about_copy_failed()}</p>
  {/if}
  {#if opening.hasFailed}
    <p class="mbs-sm">{m.about_browser_unavailable()}</p>
  {/if}
</div>
