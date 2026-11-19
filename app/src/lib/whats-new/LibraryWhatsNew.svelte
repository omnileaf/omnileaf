<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { getCrashReporting } from "#lib/crash-report/crash-reporting.svelte.ts";
  import {
    commands,
    type Platform,
    type VersionNotes,
  } from "#lib/ipc/bindings.ts";

  import { hasWhatsNew } from "./about-row.ts";
  import { whatsNewSeenForApp } from "./whats-new-seen.ts";
  import WhatsNewSheet from "./WhatsNewSheet.svelte";

  let {
    platform,
    installed,
    isLibraryBusy,
  }: {
    platform: Platform;
    installed: string;
    isLibraryBusy: boolean;
  } = $props();

  const seen = whatsNewSeenForApp();
  const crashReporting = getCrashReporting();
  let waiting = $state<VersionNotes>();
  let shown = $state<VersionNotes>();

  $effect(() => {
    if (
      waiting === undefined ||
      shown !== undefined ||
      isLibraryBusy ||
      !crashReporting.isQuiet
    ) {
      return;
    }
    shown = waiting;
    seen.shown();
  });

  function close(): void {
    if (shown !== undefined) {
      seen.dismissed(shown);
    }
    waiting = undefined;
    shown = undefined;
  }

  function seeAll(): void {
    close();
    void goto(resolve("/(app)/settings/about/whats-new"));
  }

  onMount(() => {
    if (!hasWhatsNew(platform)) {
      return;
    }
    seen.notesToShow(installed, commands.whatsNewNotice).then(
      (notes) => {
        waiting = notes;
      },
      (error: unknown) => {
        reportError(error);
      },
    );
  });
</script>

<WhatsNewSheet notes={shown} onSeeAll={seeAll} onClose={close} />
