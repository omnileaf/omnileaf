<script lang="ts" generics="PageProps extends Record<string, unknown>">
  import { type Component, untrack } from "svelte";

  import {
    type ScreenshotMode,
    setScreenshotMode,
  } from "$lib/screenshot-mode/screenshot-mode.svelte";

  interface Props {
    readonly screenshotMode: ScreenshotMode;
    readonly page: Component<PageProps>;
    readonly pageProps: PageProps;
  }

  let { screenshotMode, page, pageProps }: Props = $props();

  setScreenshotMode(untrack(() => screenshotMode));

  const Page = $derived(page);
</script>

<Page {...pageProps} />
