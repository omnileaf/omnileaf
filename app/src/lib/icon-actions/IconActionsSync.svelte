<script lang="ts">
  import { Channel } from "@tauri-apps/api/core";
  import { onMount, tick } from "svelte";

  import { goto } from "$app/navigation";
  import { lastUnfinishedBookPage } from "#lib/history/last-book.ts";
  import { commands, type IconAction } from "#lib/ipc/bindings.ts";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";

  import { followIconAction } from "./follow-icon-action";
  import { iconActionsMenu } from "./icon-actions-menu";

  const screenshotMode = getScreenshotMode();

  function follow(action: IconAction): void {
    void followIconAction(action, {
      toggleScreenshotMode: async () => {
        screenshotMode.settle();
        await tick();
        screenshotMode.toggle();
      },
      lastUnfinishedBookPage,
      open: (page) => goto(page),
    });
  }

  $effect(() => {
    void commands.showIconActions(iconActionsMenu(screenshotMode.activity));
  });

  onMount(() => {
    void commands.watchIconActions(new Channel(follow));
  });
</script>
