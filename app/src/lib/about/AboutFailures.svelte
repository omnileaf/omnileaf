<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";

  import { Alert, AlertTitle } from "#lib/components/ui/alert/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { LinkOpening } from "./link-opening.svelte";
  import type { DetailsCopying } from "#lib/copying/details-copying.svelte.ts";

  let { copying, opening }: { copying: DetailsCopying; opening: LinkOpening } =
    $props();
</script>

<div role="alert">
  {#if copying.outcome === "failed"}
    <Alert tone="warning" icon={CircleAlert} class="mbs-sm">
      <AlertTitle>{m.about_copy_failed()}</AlertTitle>
    </Alert>
  {/if}
  {#if opening.hasFailed}
    <Alert tone="warning" icon={CircleAlert} class="mbs-sm">
      <AlertTitle>{m.about_browser_unavailable()}</AlertTitle>
    </Alert>
  {/if}
</div>
