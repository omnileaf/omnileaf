<script lang="ts">
  import { untrack } from "svelte";

  import { getTimeFormatSetting } from "#lib/general/time-format.svelte.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { getNotices, type Notice } from "#lib/notices/notices.ts";

  import { getScreenshotMode } from "./screenshot-mode.svelte";
  import { turnedOnNotice } from "./turned-on-notice";

  let { platform }: { platform: Platform } = $props();

  const screenshotMode = getScreenshotMode();
  const notices = getNotices();
  const timeFormat = getTimeFormatSetting();

  let wasOn = screenshotMode.isOn;
  let shown: Notice | undefined;

  $effect(() => {
    const { isOn } = screenshotMode;
    if (isOn === wasOn) {
      return;
    }
    wasOn = isOn;
    untrack(() => {
      if (shown !== undefined) {
        notices.withdraw(shown);
        shown = undefined;
      }
      if (isOn) {
        shown = turnedOnNotice(
          screenshotMode.activity,
          platform,
          timeFormat.hourCycle,
          () => {
            screenshotMode.toggle();
          },
        );
        notices.show(shown);
      }
    });
  });
</script>
