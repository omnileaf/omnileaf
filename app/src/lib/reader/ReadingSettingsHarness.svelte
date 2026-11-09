<script lang="ts">
  import { untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";

  import type { Platform } from "#lib/ipc/bindings.ts";

  import { ReaderChrome, setReaderChrome } from "./reader-chrome.svelte.ts";
  import { readerSettings } from "./reader-settings.svelte.ts";
  import { setSmartFeatures, SmartFeatures } from "./smart-features.svelte.ts";
  import {
    setSkipUpNextSetting,
    SkipUpNextSetting,
  } from "#lib/up-next/skip-up-next.svelte.ts";
  import ReadingSettings from "./ReadingSettings.svelte";
  import { SeriesReadingDirection } from "./reading-direction.svelte.ts";

  const SERIES = "0190a3e4-0000-8000-8000-0000000000a1";

  let {
    platform,
    canUseMyPace = true,
  }: { platform: Platform; canUseMyPace?: boolean } = $props();

  setReaderChrome(untrack(() => new ReaderChrome(platform)));
  setSmartFeatures(new SmartFeatures(undefined));
  setSkipUpNextSetting(new SkipUpNextSetting(undefined));

  const settings = untrack(() => readerSettings(SERIES));
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

<main>
  <ReadingSettings
    isOpen={true}
    {settings}
    {reading}
    seriesTitle="Sample Series"
    {canUseMyPace}
    onClose={nothing}
  />
</main>
