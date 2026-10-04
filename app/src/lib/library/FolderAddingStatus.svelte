<script lang="ts">
  import type { IpcErrorCode } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import type { FolderAdding } from "./folder-adding.svelte";
  import ScanProgressBar from "./ScanProgressBar.svelte";

  const FAILURE_MESSAGES = {
    folderPickerUnavailable: m.library_folder_picker_unavailable,
    folderUnreadable: m.library_folder_unreadable,
    folderNotFound: m.library_add_folder_failed,
    homeFolderKept: m.library_add_folder_failed,
    internal: m.library_add_folder_failed,
  } satisfies Record<IpcErrorCode, () => string>;

  let { adding }: { adding: FolderAdding } = $props();

  const progressTitleId = $props.id();

  const outcome = $derived(adding.outcome);
</script>

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
{#if outcome.kind === "finding" || outcome.kind === "reading"}
  <ScanProgressBar step={outcome} titleId={progressTitleId} />
{/if}
