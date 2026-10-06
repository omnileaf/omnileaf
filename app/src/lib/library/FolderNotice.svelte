<script lang="ts">
  import { CircleAlert, CircleCheckBig } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  import type { FolderScan } from "$lib/ipc/bindings";
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

  const progressTitleId = $props.id();
  const progressCountId = `${progressTitleId}-count`;

  onDestroy(() => {
    adding.withdrawFailure();
  });

  function shownName(scan: FolderScan): string {
    return usesStandIns
      ? standInName("folder", SHOWN_FOLDER_STAND_IN)
      : scan.name;
  }

  function problemsIn(scan: FolderScan): string[] {
    return [
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
  }

  function noticeFor(outcome: FolderOutcome): Notice | undefined {
    if (outcome.kind !== "scanned") {
      return undefined;
    }
    const { scan } = outcome;
    const name = shownName(scan);
    const title =
      scan.books === 0
        ? m.library_folder_no_books({ name })
        : m.library_folder_scanned({
            books: scan.books,
            series: scan.series,
            name,
          });
    const problems = problemsIn(scan);
    if (problems.length === 0) {
      return { tone: "done", icon: CircleCheckBig, title };
    }
    return {
      tone: "warning",
      icon: CircleAlert,
      title,
      body: problems.join(" "),
    };
  }

  const notice = $derived(noticeFor(adding.outcome));

  function dismiss(): void {
    adding.dismiss();
    onDismissed();
  }
</script>

<div role="status">
  {#if adding.outcome.kind === "finding" || adding.outcome.kind === "reading"}
    <p id={progressTitleId} class="font-semibold">
      {m.library_scan_finding()}
    </p>
  {:else if notice !== undefined}
    <NoticeCard {notice} onDismiss={dismiss} />
  {/if}
</div>
{#if adding.outcome.kind === "finding"}
  <progress aria-labelledby={progressTitleId} class="mbs-sm progress-track"
  ></progress>
{:else if adding.outcome.kind === "reading"}
  <progress
    aria-labelledby={progressTitleId}
    aria-describedby={progressCountId}
    class="mbs-sm progress-track"
    max={adding.outcome.total}
    value={adding.outcome.scanned}
  ></progress>
  <p id={progressCountId} class="mbs-xs text-footnote text-muted">
    {m.library_scan_progress({
      scanned: adding.outcome.scanned,
      total: adding.outcome.total,
    })}
  </p>
{/if}
