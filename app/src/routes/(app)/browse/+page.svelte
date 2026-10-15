<script lang="ts">
  import { Compass } from "@lucide/svelte";

  import EmptyState from "#lib/page/EmptyState.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
</script>

<CollectionHeading
  platform={data.appInfo.platform}
  title={m.browse_title()}
  showsLabel={screenshotMode.showsLabel}
/>
<EmptyState
  icon={Compass}
  title={m.browse_empty_title()}
  body={m.browse_empty_body()}
>
  <p class="text-footnote text-muted">{m.browse_empty_later()}</p>
</EmptyState>
