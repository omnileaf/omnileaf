<script lang="ts">
  import { Columns2, MoveVertical } from "@lucide/svelte";

  import { m } from "#lib/paraglide/messages.js";

  import {
    QUICK_SETTING_ICON_SIZE,
    QUICK_SETTING_LOOK,
    QUICK_SETTING_ON,
  } from "./quick-setting.ts";
  import type { PageFit, PageLayout } from "./reader-settings.svelte.ts";

  let {
    layout,
    fit,
    onLayout,
    onFit,
  }: {
    layout: PageLayout;
    fit: PageFit;
    onLayout: (layout: PageLayout) => void;
    onFit: (fit: PageFit) => void;
  } = $props();

  const isTwoUp = $derived(layout === "two");
  const isFitHeight = $derived(fit === "height");
</script>

<button
  type="button"
  aria-pressed={isTwoUp}
  class={[QUICK_SETTING_LOOK, isTwoUp && QUICK_SETTING_ON]}
  onclick={() => {
    onLayout(isTwoUp ? "automatic" : "two");
  }}
>
  <Columns2
    size={QUICK_SETTING_ICON_SIZE}
    aria-hidden="true"
    class="shrink-0"
  />
  {m.reader_two_pages()}
</button>
<button
  type="button"
  aria-pressed={isFitHeight}
  class={[
    QUICK_SETTING_LOOK,
    "max-expanded:hidden",
    isFitHeight && QUICK_SETTING_ON,
  ]}
  onclick={() => {
    onFit(isFitHeight ? "screen" : "height");
  }}
>
  <MoveVertical
    size={QUICK_SETTING_ICON_SIZE}
    aria-hidden="true"
    class="shrink-0"
  />
  {m.reader_fit_height()}
</button>
