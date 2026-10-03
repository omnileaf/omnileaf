<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import type {
    FolderScan,
    IpcErrorCode,
    ScanProgress,
  } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import type { AddFolder } from "./add-folder";
  import { ICON_SIZE } from "./icon-size";

  type Outcome =
    | { readonly kind: "idle" }
    | { readonly kind: "adding" }
    | { readonly kind: "finding" }
    | {
        readonly kind: "reading";
        readonly scanned: number;
        readonly total: number;
      }
    | { readonly kind: "scanned"; readonly scan: FolderScan }
    | { readonly kind: "failed"; readonly code: IpcErrorCode };

  const FAILURE_MESSAGES = {
    folderPickerUnavailable: m.library_folder_picker_unavailable,
    folderUnreadable: m.library_folder_unreadable,
    folderNotFound: m.library_add_folder_failed,
    homeFolderKept: m.library_add_folder_failed,
    internal: m.library_add_folder_failed,
  } satisfies Record<IpcErrorCode, () => string>;

  let {
    addFolder,
    onFinished,
  }: {
    addFolder: AddFolder;
    onFinished?: () => void;
  } = $props();

  const progressTitleId = $props.id();
  const progressCountId = `${progressTitleId}-count`;

  let outcome: Outcome = $state({ kind: "idle" });

  function isBusy(current: Outcome): boolean {
    return (
      current.kind === "adding" ||
      current.kind === "finding" ||
      current.kind === "reading"
    );
  }

  /** Progress can arrive after the result it led to, which must not turn back into a scan in progress. */
  function showProgress(progress: ScanProgress): void {
    if (isBusy(outcome)) {
      outcome =
        progress.stage === "finding"
          ? { kind: "finding" }
          : {
              kind: "reading",
              scanned: progress.scanned,
              total: progress.total,
            };
    }
  }

  async function add(): Promise<void> {
    outcome = { kind: "adding" };
    const result = await addFolder(showProgress);
    if (result.status === "error") {
      outcome = { kind: "failed", code: result.error.code };
    } else if (result.data === null) {
      outcome = { kind: "idle" };
      return;
    } else {
      outcome = { kind: "scanned", scan: result.data };
    }
    onFinished?.();
  }
</script>

<button
  type="button"
  class="flex items-center justify-center gap-sm rounded-control bg-accent px-lg font-semibold text-on-accent min-block-touch-target disabled:opacity-60 max-medium:inline-full"
  disabled={isBusy(outcome)}
  onclick={add}
>
  <Plus size={ICON_SIZE} aria-hidden="true" />
  {m.library_add_folder()}
</button>
<div class="mbs-sm">
  <div role="status">
    {#if outcome.kind === "finding" || outcome.kind === "reading"}
      <p id={progressTitleId} class="font-semibold">
        {m.library_scan_finding()}
      </p>
    {:else if outcome.kind === "scanned"}
      {@const scan = outcome.scan}
      <p>
        {scan.books === 0
          ? m.library_folder_no_books({ name: scan.name })
          : m.library_folder_scanned({
              books: scan.books,
              series: scan.series,
              name: scan.name,
            })}
      </p>
      {#if scan.unreadableBooks > 0}
        <p>
          {m.library_folder_unreadable_books({ count: scan.unreadableBooks })}
        </p>
      {/if}
      {#if scan.unreadableFolders > 0}
        <p>
          {m.library_folder_unreadable_subfolders({
            count: scan.unreadableFolders,
          })}
        </p>
      {/if}
    {:else if outcome.kind === "failed"}
      <p>{FAILURE_MESSAGES[outcome.code]()}</p>
    {/if}
  </div>
  {#if outcome.kind === "finding"}
    <progress aria-labelledby={progressTitleId} class="mbs-sm progress-track"
    ></progress>
  {:else if outcome.kind === "reading"}
    <progress
      aria-labelledby={progressTitleId}
      aria-describedby={progressCountId}
      class="mbs-sm progress-track"
      max={outcome.total}
      value={outcome.scanned}
    ></progress>
    <p id={progressCountId} class="mbs-xs text-caption text-muted">
      {m.library_scan_progress({
        scanned: outcome.scanned,
        total: outcome.total,
      })}
    </p>
  {/if}
</div>
