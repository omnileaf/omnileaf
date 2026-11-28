<script lang="ts" generics="PageProps extends Record<string, unknown>">
  import { type Component, untrack } from "svelte";

  import {
    AnimationsSetting,
    setAnimationsSetting,
  } from "#lib/appearance/animations.svelte.ts";

  import { CrashReportSetting } from "#lib/crash-report/choice.svelte.ts";
  import {
    CrashReporting,
    setCrashReporting,
  } from "#lib/crash-report/crash-reporting.svelte.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import {
    LibraryReturn,
    setLibraryReturn,
  } from "#lib/library/library-return.ts";
  import {
    setSidebarSetting,
    SidebarSetting,
  } from "#lib/navigation/sidebar.svelte.ts";
  import { Notices, setNotices } from "#lib/notices/notices.ts";
  import {
    NeedsAttention,
    setNeedsAttention,
  } from "#lib/problems/needs-attention.svelte.ts";
  import {
    ScheduledRescansSetting,
    setScheduledRescansSetting,
  } from "#lib/scheduled-rescans/scheduled-rescans.svelte.ts";
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
  setCrashReporting(
    new CrashReporting(commands, new CrashReportSetting(undefined)),
  );
  setNeedsAttention(
    new NeedsAttention(
      {
        missingFolders: () => Promise.resolve({ status: "ok", data: [] }),
        storageUse: () => undefined,
      },
      () => undefined,
    ),
  );
  setSidebarSetting(new SidebarSetting(undefined));
  setAnimationsSetting(new AnimationsSetting(undefined));
  setScheduledRescansSetting(new ScheduledRescansSetting(undefined));
  setLibraryReturn(new LibraryReturn());

  const Page = $derived(page);
</script>

<main>
  <Page {...pageProps} />
</main>
