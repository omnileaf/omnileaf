<script lang="ts">
  import { untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";

  import { resolve } from "$app/paths";
  import type { Platform } from "#lib/ipc/bindings.ts";

  import DirectionMenu from "./DirectionMenu.svelte";
  import LayoutQuickSettings from "./LayoutQuickSettings.svelte";
  import LightQuickSetting from "./LightQuickSetting.svelte";
  import { ReaderChrome, setReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderMore from "./ReaderMore.svelte";
  import type { PageLayout } from "./reader-settings.svelte.ts";
  import { SeriesReadingDirection } from "./reading-direction.svelte.ts";
  import ReaderTopBar from "./ReaderTopBar.svelte";

  const SERIES = "0190a3e4-0000-8000-8000-0000000000a1";

  let { platform }: { platform: Platform } = $props();

  setReaderChrome(untrack(() => new ReaderChrome(platform)));

  let layout: PageLayout = $state("automatic");

  const values = new SvelteMap<string, string>();
  const reading = new SeriesReadingDirection(
    {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
    SERIES,
    null,
    null,
  );

  function nothing(): void {}
</script>

{#snippet quickSettings()}
  <DirectionMenu {reading} seriesTitle="Sample Series" onOpenChange={nothing} />
  <LayoutQuickSettings
    {layout}
    fit="screen"
    onLayout={(chosen: PageLayout) => {
      layout = chosen;
    }}
    onFit={nothing}
  />
  <LightQuickSetting
    light={{ isOn: false, brightness: 80, warmth: 20 }}
    onChange={nothing}
    onOpenChange={nothing}
  />
{/snippet}

{#snippet more()}
  <ReaderMore
    title="Volume 2"
    seriesTitle="Sample Series"
    pageNumber={4}
    pageCount={64}
    {platform}
    onMarkRead={nothing}
    onStartOver={nothing}
    onOpenChange={nothing}
  />
{/snippet}

<main>
  <ReaderTopBar
    seriesHref={resolve("/(app)")}
    isInLibrary={true}
    {platform}
    seriesTitle="Sample Series"
    bookTitle="Volume 2"
    pageNumber={4}
    pageCount={64}
    {quickSettings}
    {more}
    isSettingsOpen={false}
    areShortcutsOpen={false}
    onShortcuts={nothing}
    bookmark={{ label: "Bookmark this page", isPressed: false }}
    onBookmark={nothing}
    isJumpOpen={false}
    onJump={nothing}
    onSettings={nothing}
    onFullScreen={nothing}
  />
</main>
