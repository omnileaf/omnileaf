<script lang="ts">
  import { CircleAlert, CircleCheckBig } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  import { m } from "$lib/paraglide/messages.js";

  import type { FolderAdding, FolderOutcome } from "./folder-adding.svelte";
  import type { Notice } from "./notice";
  import NoticeCard from "./NoticeCard.svelte";

  let {
    adding,
    onDismissed,
  }: { adding: FolderAdding; onDismissed: () => void } = $props();

  onDestroy(() => {
    adding.withdrawFailure();
  });

  function noticeFor(outcome: FolderOutcome): Notice | undefined {
    if (outcome.kind !== "found") {
      return undefined;
    }
    const { survey } = outcome;
    const title = m.library_folder_found({
      count: survey.comicFiles,
      name: survey.name,
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
