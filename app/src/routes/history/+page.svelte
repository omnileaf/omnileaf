<script lang="ts">
  import { RotateCcwClock } from "@lucide/svelte";

  import EmptyState from "$lib/page/EmptyState.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import CollectionHeading from "$lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";

  const screenshotMode = getScreenshotMode();
</script>

<CollectionHeading
  title={m.history_title()}
  showsLabel={screenshotMode.showsLabel}
/>
<EmptyState
  icon={RotateCcwClock}
  title={m.history_empty_title()}
  body={m.history_empty_body()}
/>
