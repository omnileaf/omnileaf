<script lang="ts">
  import { Columns2, MoveVertical } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { quickSettingLook } from "./quick-setting.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderIcon from "./ReaderIcon.svelte";
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
  const chrome = getReaderChrome();
  const look = $derived(quickSettingLook(chrome.platform, chrome.width));
</script>

<button
  type="button"
  aria-pressed={isTwoUp}
  class={cn(look.button, look.toggle, isTwoUp && look.on)}
  onclick={() => {
    onLayout(isTwoUp ? "automatic" : "two");
  }}
>
  <ReaderIcon
    name="columns-2"
    fallback={Columns2}
    isKit={look.hasKitIcons}
    size={look.iconSize}
    class="shrink-0"
  />
  <span class={look.toggleLabel}>{m.reader_two_pages()}</span>
</button>
<button
  type="button"
  aria-pressed={isFitHeight}
  class={cn(look.button, "max-expanded:hidden", isFitHeight && look.on)}
  onclick={() => {
    onFit(isFitHeight ? "screen" : "height");
  }}
>
  <MoveVertical size={look.iconSize} aria-hidden="true" class="shrink-0" />
  {m.reader_fit_height()}
</button>
