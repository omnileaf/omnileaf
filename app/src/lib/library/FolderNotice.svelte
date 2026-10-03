<script lang="ts">
  import { CircleAlert, CircleCheckBig, Unplug } from "@lucide/svelte";

  import type { IpcErrorCode } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import type { FolderAdding, FolderOutcome } from "./folder-adding.svelte";
  import type { Notice } from "./notice";
  import NoticeCard from "./NoticeCard.svelte";

  const FAILURE_MESSAGES = {
    folderPickerUnavailable: m.library_folder_picker_unavailable,
    folderUnreadable: m.library_folder_unreadable,
    internal: m.library_add_folder_failed,
  } satisfies Record<IpcErrorCode, () => string>;

  let {
    adding,
    onDismissed,
  }: { adding: FolderAdding; onDismissed: () => void } = $props();

  function noticeFor(outcome: FolderOutcome): Notice | undefined {
    switch (outcome.kind) {
      case "idle":
      case "adding":
        return undefined;
      case "found": {
        const { survey } = outcome;
        const title = m.library_folder_found({
          count: survey.comicFiles,
          name: survey.name,
        });
        if (survey.unreadableFolders === 0) {
          return {
            urgency: "status",
            tone: "done",
            icon: CircleCheckBig,
            title,
          };
        }
        return {
          urgency: "status",
          tone: "warning",
          icon: CircleAlert,
          title,
          body: m.library_folder_unreadable_subfolders({
            count: survey.unreadableFolders,
          }),
        };
      }
      case "failed":
        return {
          urgency: "alert",
          tone: "warning",
          icon: Unplug,
          title: FAILURE_MESSAGES[outcome.code](),
        };
    }
  }

  const notice = $derived(noticeFor(adding.outcome));

  function dismiss(): void {
    adding.dismiss();
    onDismissed();
  }
</script>

<div>
  <div role="status">
    {#if notice?.urgency === "status"}
      <NoticeCard {notice} onDismiss={dismiss} />
    {/if}
  </div>
  <div role="alert">
    {#if notice?.urgency === "alert"}
      <NoticeCard {notice} onDismiss={dismiss} />
    {/if}
  </div>
</div>
