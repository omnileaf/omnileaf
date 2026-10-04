<script lang="ts">
  import { CircleAlert, CircleCheckBig } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  import type { FolderSurvey } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";
  import { standInName } from "$lib/screenshot-mode/stand-ins";

  import type { FolderAdding, FolderOutcome } from "./folder-adding.svelte";
  import type { Notice } from "./notice";
  import NoticeCard from "./NoticeCard.svelte";

  interface Props {
    readonly adding: FolderAdding;
    readonly usesStandIns: boolean;
    readonly onDismissed: () => void;
  }

  let { adding, usesStandIns, onDismissed }: Props = $props();

  const SHOWN_FOLDER_STAND_IN = 1;

  onDestroy(() => {
    adding.withdrawFailure();
  });

  function shownName(survey: FolderSurvey): string {
    return usesStandIns
      ? standInName("folder", SHOWN_FOLDER_STAND_IN)
      : survey.name;
  }

  function noticeFor(outcome: FolderOutcome): Notice | undefined {
    if (outcome.kind !== "found") {
      return undefined;
    }
    const { survey } = outcome;
    const title = m.library_folder_found({
      count: survey.comicFiles,
      name: shownName(survey),
    });
    if (survey.unreadableFolders === 0) {
      return { tone: "done", icon: CircleCheckBig, title };
    }
    return {
      tone: "warning",
      icon: CircleAlert,
      title,
      body: m.library_folder_unreadable_subfolders({
        count: survey.unreadableFolders,
      }),
    };
  }

  const notice = $derived(noticeFor(adding.outcome));

  function dismiss(): void {
    adding.dismiss();
    onDismissed();
  }
</script>

<div role="status">
  {#if notice !== undefined}
    <NoticeCard {notice} onDismiss={dismiss} />
  {/if}
</div>
