<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import type { commands, FolderScan, IpcErrorCode } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import { ICON_SIZE } from "./icon-size";

  type Outcome =
    | { readonly kind: "idle" }
    | { readonly kind: "adding" }
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
    onAdded,
  }: {
    addFolder: typeof commands.addLibraryFolder;
    onAdded?: () => void;
  } = $props();

  let outcome: Outcome = $state({ kind: "idle" });

  async function add(): Promise<void> {
    outcome = { kind: "adding" };
    const result = await addFolder();
    if (result.status === "error") {
      outcome = { kind: "failed", code: result.error.code };
    } else if (result.data === null) {
      outcome = { kind: "idle" };
    } else {
      outcome = { kind: "scanned", scan: result.data };
      onAdded?.();
    }
  }
</script>

<button
  type="button"
  class="flex items-center justify-center gap-sm rounded-control bg-accent px-lg font-semibold text-on-accent min-block-touch-target disabled:opacity-60 max-medium:inline-full"
  disabled={outcome.kind === "adding"}
  onclick={add}
>
  <Plus size={ICON_SIZE} aria-hidden="true" />
  {m.library_add_folder()}
</button>
<div role="status" class="mbs-sm">
  {#if outcome.kind === "scanned"}
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
