<script lang="ts">
  import { untrack } from "svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";

  import PageSlider from "./PageSlider.svelte";
  import { ReaderChrome, setReaderChrome } from "./reader-chrome.svelte.ts";

  let { platform }: { platform: Platform } = $props();

  setReaderChrome(untrack(() => new ReaderChrome(platform)));

  function nothing(): void {}
</script>

<div class="flex inline-reader-settings">
  <PageSlider
    shown={3}
    count={30}
    direction="leftToRight"
    onSeek={nothing}
    onDrag={nothing}
    onFocusChange={nothing}
  />
</div>
