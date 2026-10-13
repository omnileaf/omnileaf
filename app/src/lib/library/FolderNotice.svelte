<script lang="ts">
  import { CircleAlert, CircleCheckBig } from "@lucide/svelte";
  import { onDestroy, untrack } from "svelte";

  import type { FolderScan } from "#lib/ipc/bindings.ts";
  import type { Notices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { folderStandIn } from "#lib/screenshot-mode/stand-ins.ts";

  import type { FolderAdding, FolderOutcome } from "./folder-adding.svelte";
  import type { Notice } from "./notice";
  import NoticeCard from "./NoticeCard.svelte";
  import ScanToast from "./ScanToast.svelte";

  interface Props {
    readonly adding: FolderAdding;
    readonly notices: Notices;
    readonly usesStandIns: boolean;
    readonly onShow?: (() => void) | undefined;
    readonly onDismissed: () => void;
  }

  let { adding, notices, usesStandIns, onShow, onDismissed }: Props = $props();

  onDestroy(() => {
    adding.withdrawFailure();
  });

  function shownName(scan: FolderScan): string {
    return usesStandIns ? folderStandIn(scan.name) : scan.name;
  }

  function problemsIn(scan: FolderScan): string | undefined {
    const problems = [
      scan.unreadableBooks > 0
        ? m.library_folder_unreadable_books({ count: scan.unreadableBooks })
        : undefined,
      scan.unsupportedBooks > 0
        ? m.library_folder_unsupported_books({ count: scan.unsupportedBooks })
        : undefined,
      scan.unreadableFolders > 0
        ? m.library_folder_unreadable_subfolders({
            count: scan.unreadableFolders,
          })
        : undefined,
    ].filter((problem) => problem !== undefined);
    return problems.length === 0 ? undefined : problems.join(" ");
  }

  function isFollowedInToast(outcome: FolderOutcome): boolean {
    return (
      outcome.kind === "finding" ||
      outcome.kind === "reading" ||
      (outcome.kind === "scanned" && outcome.scan.books > 0)
    );
  }

  function followInToast(): void {
    notices.present(
      ScanToast,
      (toast) => ({
        adding,
        toast,
        folderName: shownName,
        problemsIn,
        onShow,
      }),
      "polite",
    );
  }

  let wasFollowed = untrack(() => isFollowedInToast(adding.outcome));

  $effect(() => {
    const isFollowed = isFollowedInToast(adding.outcome);
    if (isFollowed && !wasFollowed) {
      untrack(followInToast);
    }
    wasFollowed = isFollowed;
  });

  function emptyFolderNotice(outcome: FolderOutcome): Notice | undefined {
    if (outcome.kind !== "scanned" || outcome.scan.books > 0) {
      return undefined;
    }
    const { scan } = outcome;
    const title = m.library_folder_no_books({ name: shownName(scan) });
    const body = problemsIn(scan);
    if (body === undefined) {
      return { tone: "done", icon: CircleCheckBig, title };
    }
    return { tone: "warning", icon: CircleAlert, title, body };
  }

  const notice = $derived(emptyFolderNotice(adding.outcome));

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
