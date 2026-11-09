<script lang="ts">
  import { untrack } from "svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";

  import { ReaderChrome, setReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderGuide from "./ReaderGuide.svelte";
  import type { TapZones } from "./reader-settings.svelte.ts";

  let { platform, zones }: { platform: Platform; zones: TapZones } = $props();

  setReaderChrome(untrack(() => new ReaderChrome(platform)));

  function nothing(): void {}
</script>

<main class="fixed inset-none">
  <ReaderGuide
    direction="leftToRight"
    {zones}
    isTouch={true}
    onDone={nothing}
  />
</main>
