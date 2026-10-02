<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import type { commands, FolderSurvey, IpcErrorCode } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  type Outcome =
    | { readonly kind: "idle" }
    | { readonly kind: "adding" }
    | { readonly kind: "found"; readonly survey: FolderSurvey }
    | { readonly kind: "failed"; readonly code: IpcErrorCode };

  const FAILURE_MESSAGES = {
    folderPickerUnavailable: m.library_folder_picker_unavailable,
    folderUnreadable: m.library_folder_unreadable,
    folderNotFound: m.library_add_folder_failed,
    homeFolderKept: m.library_add_folder_failed,
    internal: m.library_add_folder_failed,
  } satisfies Record<IpcErrorCode, () => string>;

  const ICON_SIZE = 20;

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
      outcome = { kind: "found", survey: result.data };
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
  {#if outcome.kind === "found"}
    <p>
      {m.library_folder_found({
        count: outcome.survey.comicFiles,
        name: outcome.survey.name,
      })}
    </p>
    {#if outcome.survey.unreadableFolders > 0}
      <p>
        {m.library_folder_unreadable_subfolders({
          count: outcome.survey.unreadableFolders,
        })}
      </p>
    {/if}
  {:else if outcome.kind === "failed"}
    <p>{FAILURE_MESSAGES[outcome.code]()}</p>
  {/if}
</div>
