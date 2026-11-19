<script lang="ts">
  import { untrack } from "svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";

  import type { AutoScrollSpeed } from "./auto-scroll.ts";
  import AutoScrollBar from "./AutoScrollBar.svelte";
  import { ReaderChrome, setReaderChrome } from "./reader-chrome.svelte.ts";

  let {
    platform,
    speed,
    onSpeed,
  }: {
    platform: Platform;
    speed: AutoScrollSpeed;
    onSpeed: (event: MouseEvent) => void;
  } = $props();

  setReaderChrome(untrack(() => new ReaderChrome(platform)));

  function nothing(): void {}
</script>

<main class="fixed inset-none">
  <AutoScrollBar
    {speed}
    chapterProgress={0.42}
    isPaused={false}
    isTouch={true}
    onToggle={nothing}
    onSlower={nothing}
    onFaster={nothing}
    onStop={nothing}
    onReturnFocus={nothing}
    {onSpeed}
  />
</main>
