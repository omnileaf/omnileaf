<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import type { ResolvedPathname } from "$app/types";
  import { assertNever } from "#lib/assert-never.ts";
  import { getTimeFormatSetting } from "#lib/general/time-format.svelte.ts";
  import { lastUnfinishedBookPage } from "#lib/history/last-book.ts";
  import { commands, events, type TrayItemChosen } from "#lib/ipc/bindings.ts";
  import { listenFor } from "#lib/ipc/listen-for.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { getScreenshotModeShortcut } from "#lib/screenshot-mode/shortcut-setting.svelte.ts";

  import { trayMenu } from "./tray-menu";

  const screenshotMode = getScreenshotMode();
  const shortcut = getScreenshotModeShortcut();
  const timeFormat = getTimeFormatSetting();

  let hasBookToContinue = $state(false);

  async function checkForBookToContinue(): Promise<void> {
    hasBookToContinue = (await lastUnfinishedBookPage()) !== undefined;
  }

  async function continueReading(): Promise<void> {
    await openBookPage(await lastUnfinishedBookPage());
  }

  async function openBookPage(
    page: ResolvedPathname | undefined,
  ): Promise<void> {
    if (page !== undefined) {
      await goto(page);
    }
  }

  function choose(item: TrayItemChosen): void {
    switch (item) {
      case "screenshotMode":
        screenshotMode.toggle();
        return;
      case "continueReading":
        void continueReading();
        return;
      default:
        assertNever(item);
    }
  }

  $effect(() => {
    void commands.showTrayMenu(
      trayMenu({
        activity: screenshotMode.activity,
        hourCycle: timeFormat.hourCycle,
        shortcut: shortcut.combination,
        hasBookToContinue,
      }),
    );
  });

  onMount(() => {
    void checkForBookToContinue();
    const listening = [
      listenFor(
        (handler) => events.trayItemChosen.listen(handler),
        choose,
        reportError,
      ),
      listenForLibraryChanges(() => void checkForBookToContinue(), reportError),
      listenFor(
        (handler) => events.readingSaved.listen(handler),
        () => void checkForBookToContinue(),
        reportError,
      ),
    ];
    return () => {
      for (const stop of listening) {
        stop();
      }
    };
  });
</script>
