<script lang="ts">
  import { CircleAlert, CircleCheckBig, Unplug, X } from "@lucide/svelte";

  import type { IpcErrorCode } from "$lib/ipc/bindings";
  import type { Glyph } from "$lib/page/glyph";
  import { m } from "$lib/paraglide/messages.js";

  import type { FolderAdding, FolderOutcome } from "./folder-adding.svelte";

  type Tone = "done" | "warning";

  interface Notice {
    readonly tone: Tone;
    readonly icon: Glyph;
    readonly title: string;
    readonly body?: string;
  }

  const FAILURE_MESSAGES = {
    folderPickerUnavailable: m.library_folder_picker_unavailable,
    folderUnreadable: m.library_folder_unreadable,
    internal: m.library_add_folder_failed,
  } satisfies Record<IpcErrorCode, () => string>;

  const TONES = {
    done: {
      card: "border-border bg-card text-foreground",
      tile: "bg-accent-soft",
    },
    warning: {
      card: "border-warning-edge bg-warning-soft text-on-warning",
      tile: "bg-warning-tile",
    },
  } satisfies Record<Tone, { card: string; tile: string }>;

  const ICON_SIZE = 20;
  const DISMISS_SIZE = 18;

  let { adding }: { adding: FolderAdding } = $props();

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
      case "failed":
        return {
          tone: "warning",
          icon: Unplug,
          title: FAILURE_MESSAGES[outcome.code](),
        };
    }
  }

  const notice = $derived(noticeFor(adding.outcome));
</script>

<div role="status">
  {#if notice !== undefined}
    <div
      class={[
        "flex items-start gap-md rounded-card border py-md ps-md pe-sm text-start",
        TONES[notice.tone].card,
      ]}
    >
      <span
        class={[
          "flex shrink-0 items-center justify-center rounded-tile block-tile inline-tile",
          TONES[notice.tone].tile,
        ]}
      >
        <notice.icon size={ICON_SIZE} />
      </span>
      <span class="flex flex-1 flex-col gap-2xs self-center">
        <span class="text-label font-bold">{notice.title}</span>
        {#if notice.body !== undefined}
          <span class="text-footnote opacity-85">{notice.body}</span>
        {/if}
      </span>
      <button
        type="button"
        aria-label={m.notice_dismiss()}
        class="-my-xs flex shrink-0 items-center justify-center rounded-full opacity-70 block-touch-target inline-touch-target desktop:my-none desktop:block-dismiss desktop:inline-dismiss"
        onclick={() => {
          adding.dismiss();
        }}
      >
        <X size={DISMISS_SIZE} />
      </button>
    </div>
  {/if}
</div>
