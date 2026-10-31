<script lang="ts">
  import { untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";

  import type { BookPage, Platform } from "#lib/ipc/bindings.ts";

  import DirectionMenu from "./DirectionMenu.svelte";
  import { ReaderChrome, setReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderPanel from "./ReaderPanel.svelte";
  import { SeriesReadingDirection } from "./reading-direction.svelte.ts";

  let {
    platform,
    controls,
    canPlay = false,
  }: {
    platform: Platform;
    controls: "dark" | "matchApp";
    canPlay?: boolean;
  } = $props();

  const PAGE_COUNT = 12;
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

  function nothing(): void {}
</script>

{#snippet quickSettings()}
  <DirectionMenu {reading} seriesTitle="Sample Series" onOpenChange={nothing} />
{/snippet}

<main
  data-theme={controls === "dark" ? "dark" : undefined}
  class="fixed inset-none text-on-reader"
>
  <div class="absolute inset-x-none inset-be-none">
    <ReaderPanel
      {pages}
      shown={4}
      spread={[4]}
      previous={null}
      next={null}
      direction="leftToRight"
      {quickSettings}
      secondsLeft={600}
      isBlank={true}
      showsPreviews={true}
      isShown={true}
      onPlay={canPlay ? nothing : undefined}
      onSeek={nothing}
    />
  </div>
</main>
