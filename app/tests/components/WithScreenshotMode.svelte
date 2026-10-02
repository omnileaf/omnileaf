<script lang="ts">
  import { type Component, untrack } from "svelte";

  import {
    type ScreenshotMode,
    setScreenshotMode,
  } from "$lib/screenshot-mode/screenshot-mode.svelte";

  interface Props {
    readonly screenshotMode: ScreenshotMode;
    readonly page: Component;
  }

  let { screenshotMode, page }: Props = $props();

  setScreenshotMode(untrack(() => screenshotMode));

  const Page = $derived(page);
</script>

<Page />
