<script lang="ts">
  import {
    FolderX,
    Lock,
    type LucideIcon,
    TriangleAlert,
  } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  import type { commands, FolderSurvey, IpcErrorCode } from "$lib/ipc/bindings";
  import type { Notice, Notices } from "$lib/notices/notices.svelte";
  import { m } from "$lib/paraglide/messages.js";

  type Outcome =
    | { readonly kind: "idle" }
    | { readonly kind: "adding" }
    | { readonly kind: "found"; readonly survey: FolderSurvey };

  interface Failure {
    readonly icon: LucideIcon;
    readonly title: () => string;
    readonly body: () => string;
    readonly retry: (() => string) | undefined;
  }

  const FAILURES = {
    folderUnreadable: {
      icon: Lock,
      title: m.library_folder_unreadable_title,
      body: m.library_folder_unreadable_body,
      retry: m.library_choose_another_folder,
    },
    folderPickerUnavailable: {
      icon: FolderX,
      title: m.library_folder_picker_unavailable_title,
      body: m.library_folder_picker_unavailable_body,
      retry: undefined,
    },
    internal: {
      icon: TriangleAlert,
      title: m.library_add_folder_failed_title,
      body: m.library_add_folder_failed_body,
      retry: m.library_add_folder_try_again,
    },
  } satisfies Record<IpcErrorCode, Failure>;

  let {
    addFolder,
    notices,
  }: { addFolder: typeof commands.addLibraryFolder; notices: Notices } =
    $props();

  let outcome: Outcome = $state({ kind: "idle" });
  let failure: Notice | undefined;

  onDestroy(withdrawFailure);

  function withdrawFailure(): void {
    if (failure !== undefined) {
      notices.withdraw(failure);
    }
  }

  function failureNotice(code: IpcErrorCode): Notice {
    const { icon, title, body, retry }: Failure = FAILURES[code];
    return {
      tone: "warning",
      icon,
      title: title(),
      body: body(),
      actions:
        retry === undefined
          ? []
          : [
              {
                label: retry(),
                emphasis: "primary",
                run: () => {
                  void add();
                },
              },
            ],
    };
  }

  async function add(): Promise<void> {
    outcome = { kind: "adding" };
    const result = await addFolder();
    if (result.status === "error") {
      outcome = { kind: "idle" };
      failure = failureNotice(result.error.code);
      notices.show(failure);
      return;
    }
    withdrawFailure();
    outcome =
      result.data === null
        ? { kind: "idle" }
        : { kind: "found", survey: result.data };
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
  {/if}
</div>
