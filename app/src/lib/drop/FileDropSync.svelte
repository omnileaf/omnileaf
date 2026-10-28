<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { commands } from "#lib/ipc/bindings.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { folderStandIn } from "#lib/screenshot-mode/stand-ins.ts";

  import { droppedNotices, reportFileFailure } from "./drop-notices.ts";
  import { dropTargetAt } from "./drop-target-at.ts";
  import { FileDrop } from "./file-drop.svelte.ts";
  import FileDropOverlay from "./FileDropOverlay.svelte";
  import { listenForWindowDrag } from "./window-drag.ts";

  const ALT_TRACKING_EVENTS = [
    "keydown",
    "keyup",
    "dragenter",
    "dragover",
    "pointermove",
  ] as const;

  const notices = getNotices();
  const screenshotMode = getScreenshotMode();

  async function dataOf<Data>(
    pending: Promise<
      | { readonly status: "ok"; readonly data: Data }
      | { readonly status: "error"; readonly error: unknown }
    >,
  ): Promise<Data> {
    const result = await pending;
    if (result.status === "error") {
      throw result.error;
    }
    return result.data;
  }

  const drop = new FileDrop({
    inspect: (paths) => dataOf(commands.inspectDrop(paths)),
    drop: (paths, mode) => dataOf(commands.dropFiles(paths, mode)),
    targetAt: (at) => dropTargetAt(at.x, at.y),
    onDropped: (outcome) => {
      if (outcome.kind === "reading") {
        void goto(resolve("/read/[book]", { book: outcome.book }));
      }
      for (const notice of droppedNotices(outcome, (scan) =>
        shownName(scan.name),
      )) {
        notices.show(notice);
      }
    },
    onFailed: (error) => {
      reportFileFailure(notices, error, reportError);
    },
  });

  function shownName(name: string): string {
    return screenshotMode.isOn ? folderStandIn(name) : name;
  }

  function followAlt(event: KeyboardEvent | MouseEvent): void {
    drop.setAltHeld(event.altKey);
  }

  function letGoOfAlt(): void {
    drop.setAltHeld(false);
  }

  onMount(() => {
    const stop = listenForWindowDrag((drag) => {
      void drop.handle(drag);
    }, reportError);
    for (const type of ALT_TRACKING_EVENTS) {
      window.addEventListener(type, followAlt as EventListener);
    }
    window.addEventListener("blur", letGoOfAlt);
    return () => {
      stop();
      for (const type of ALT_TRACKING_EVENTS) {
        window.removeEventListener(type, followAlt as EventListener);
      }
      window.removeEventListener("blur", letGoOfAlt);
    };
  });
</script>

<FileDropOverlay state={drop.state} {shownName} />
