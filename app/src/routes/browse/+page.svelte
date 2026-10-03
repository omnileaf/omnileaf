<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";
  import CollectionHeading from "$lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";

  const screenshotMode = getScreenshotMode();
</script>

<CollectionHeading
  title={m.browse_title()}
  showsLabel={screenshotMode.showsLabel}
/>
<section class="mbs-2xl">
  <h2 class="text-title font-bold">{m.browse_empty_title()}</h2>
  <p class="mbs-sm text-muted">{m.browse_empty_body()}</p>
  <p class="mbs-sm text-muted">{m.browse_empty_later()}</p>
</section>
