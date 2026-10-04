<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";
  import CollectionHeading from "$lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";

  const screenshotMode = getScreenshotMode();
</script>

<CollectionHeading
  title={m.history_title()}
  showsLabel={screenshotMode.showsLabel}
/>
<section class="mbs-2xl">
  <h2 class="text-title font-bold">{m.history_empty_title()}</h2>
  <p class="mbs-sm text-muted">{m.history_empty_body()}</p>
</section>
