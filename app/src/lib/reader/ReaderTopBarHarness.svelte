<script lang="ts">
  import { untrack } from "svelte";

  import { resolve } from "$app/paths";
  import type { Platform } from "#lib/ipc/bindings.ts";

  import LayoutQuickSettings from "./LayoutQuickSettings.svelte";
  import LightQuickSetting from "./LightQuickSetting.svelte";
  import { ReaderChrome, setReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderMore from "./ReaderMore.svelte";
  import type { PageLayout } from "./reader-settings.svelte.ts";
  import ReaderTopBar from "./ReaderTopBar.svelte";

  let { platform }: { platform: Platform } = $props();

  setReaderChrome(untrack(() => new ReaderChrome(platform)));

  let layout: PageLayout = $state("automatic");

  function nothing(): void {}
</script>

{#snippet quickSettings()}
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
