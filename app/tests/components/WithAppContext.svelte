<script lang="ts" generics="PageProps extends Record<string, unknown>">
  import { type Component, untrack } from "svelte";

  import {
    setSidebarSetting,
    SidebarSetting,
  } from "#lib/navigation/sidebar.svelte.ts";
  import { Notices, setNotices } from "#lib/notices/notices.ts";
  import {
    type ScreenshotMode,
    setScreenshotMode,
  } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";

  interface Props {
    readonly screenshotMode: ScreenshotMode;
    readonly page: Component<PageProps>;
    readonly pageProps: PageProps;
  }

  let { screenshotMode, page, pageProps }: Props = $props();

  setScreenshotMode(untrack(() => screenshotMode));
  setNotices(new Notices());
  setSidebarSetting(new SidebarSetting(undefined));

  const Page = $derived(page);
</script>

<main>
  <Page {...pageProps} />
</main>
