<script lang="ts">
  import type { commands, FolderSurvey, IpcErrorCode } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";
  import { standInName } from "$lib/screenshot-mode/stand-ins";

  type Outcome =
    | { readonly kind: "idle" }
    | { readonly kind: "adding" }
    | { readonly kind: "found"; readonly survey: FolderSurvey }
    | { readonly kind: "failed"; readonly code: IpcErrorCode };

  const FAILURE_MESSAGES = {
    folderPickerUnavailable: m.library_folder_picker_unavailable,
    folderUnreadable: m.library_folder_unreadable,
    internal: m.library_add_folder_failed,
  } satisfies Record<IpcErrorCode, () => string>;

  interface Props {
    readonly addFolder: typeof commands.addLibraryFolder;
    readonly usesStandIns: boolean;
  }

  let { addFolder, usesStandIns }: Props = $props();

  const SHOWN_FOLDER_STAND_IN = 1;

  let outcome: Outcome = $state({ kind: "idle" });

  function shownName(survey: FolderSurvey): string {
    return usesStandIns
      ? standInName("folder", SHOWN_FOLDER_STAND_IN)
      : survey.name;
  }

  async function add(): Promise<void> {
    outcome = { kind: "adding" };
    const result = await addFolder();
    if (result.status === "error") {
      outcome = { kind: "failed", code: result.error.code };
    } else if (result.data === null) {
      outcome = { kind: "idle" };
    } else {
      outcome = { kind: "found", survey: result.data };
    }
  }
</script>

<button
  type="button"
  class="rounded-control bg-accent px-lg font-medium text-on-accent min-block-touch-target disabled:opacity-60"
  disabled={outcome.kind === "adding"}
  onclick={add}
>
  {m.library_add_folder()}
</button>
<div role="status" class="mbs-sm">
  {#if outcome.kind === "found"}
    <p>
      {m.library_folder_found({
        count: outcome.survey.comicFiles,
        name: shownName(outcome.survey),
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
