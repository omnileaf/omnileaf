<script lang="ts">
  import { untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";

  import type { BookPage, Platform } from "#lib/ipc/bindings.ts";

  import DirectionMenu from "./DirectionMenu.svelte";
  import LayoutQuickSettings from "./LayoutQuickSettings.svelte";
  import LightQuickSetting from "./LightQuickSetting.svelte";
  import { ReaderChrome, setReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderPanel from "./ReaderPanel.svelte";
  import type { PageLayout } from "./reader-settings.svelte.ts";
  import { SeriesReadingDirection } from "./reading-direction.svelte.ts";

  const PAGE_COUNT = 192;
  const SHOWN = 13;
  const SECONDS_LEFT = 600;

  let {
    platform,
    isTwoUp = false,
    isLit = false,
  }: { platform: Platform; isTwoUp?: boolean; isLit?: boolean } = $props();

  const pages = Array.from({ length: PAGE_COUNT }, (_, index): BookPage => ({
    path: `page/${String(index)}` as BookPage["path"],
    thumbnail: `thumb/${String(index)}` as BookPage["thumbnail"],
    size: { width: 1800, height: 2700 },
  }));

  setReaderChrome(untrack(() => new ReaderChrome(platform)));

  const values = new SvelteMap<string, string>();
  const reading = new SeriesReadingDirection(
    {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
    "0190a3e4-0000-8000-8000-0000000000a1",
    null,
    null,
  );

  const layout: PageLayout = untrack(() => (isTwoUp ? "two" : "automatic"));

  function nothing(): void {}
</script>

{#snippet quickSettings()}
  <DirectionMenu {reading} seriesTitle="Sample Series" onOpenChange={nothing} />
  <LayoutQuickSettings
    {layout}
    fit="screen"
    onLayout={nothing}
    onFit={nothing}
  />
  <LightQuickSetting
    light={{ isOn: isLit, brightness: 80, warmth: 20 }}
    onChange={nothing}
    onOpenChange={nothing}
  />
{/snippet}

<main class="fixed inset-none">
  <div class="absolute inset-x-none inset-be-none">
    <ReaderPanel
      {pages}
      shown={SHOWN}
      spread={[SHOWN]}
      previous={null}
      next={null}
      direction="leftToRight"
      {quickSettings}
      secondsLeft={SECONDS_LEFT}
      isBlank={true}
      showsPreviews={false}
      isShown={true}
      onPlay={undefined}
      onSeek={nothing}
    />
  </div>
</main>
