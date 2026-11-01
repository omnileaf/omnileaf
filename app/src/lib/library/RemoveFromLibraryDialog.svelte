<script lang="ts">
  import { ShieldCheck, Trash } from "@lucide/svelte";

  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import {
    commands,
    type RemovalPreview,
    type RemovalTarget,
  } from "#lib/ipc/bindings.ts";
  import ConfirmDialog from "#lib/page/ConfirmDialog.svelte";
  import { lastShown } from "#lib/page/last-shown.svelte.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { removalWording } from "./removal-wording";

  const NOTE_ICON_SIZE = 16;

  let {
    targets,
    isBusy,
    onConfirm,
    onCancel,
  }: {
    targets: readonly RemovalTarget[] | undefined;
    isBusy: boolean;
    onConfirm: (deleteFiles: boolean) => void;
    onCancel: () => void;
  } = $props();

  let deleteFiles = $state(false);
  let preview = $state<RemovalPreview | undefined>();

  const shown = lastShown(() => targets);
  const wording = $derived(
    shown.current === undefined
      ? undefined
      : removalWording(shown.current, preview, currentPlatform()),
  );

  $effect(() => {
    deleteFiles = false;
    preview = undefined;
    if (targets === undefined) {
      return;
    }
    let isCurrent = true;
    void commands.previewRemoval([...targets]).then((previewed) => {
      if (isCurrent && previewed.status === "ok") {
        preview = previewed.data;
      }
    });
    return () => {
      isCurrent = false;
    };
  });
</script>

<ConfirmDialog
  isOpen={targets !== undefined}
  icon={Trash}
  title={m.remove_title()}
  confirmLabel={deleteFiles ? m.remove_confirm_files() : m.remove_confirm()}
  cancelLabel={m.remove_cancel()}
  {isBusy}
  iosPhoneLook="actionSheet"
  onConfirm={() => {
    onConfirm(deleteFiles);
  }}
  {onCancel}
>
  {#if wording !== undefined}
    <p>{wording.summary}</p>
    <p
      class="flex items-start gap-sm text-footnote text-muted max-medium:text-label"
    >
      <ShieldCheck
        size={NOTE_ICON_SIZE}
        aria-hidden="true"
        class="mbs-2xs shrink-0 text-accent"
      />
      <span class="min-inline-none">{m.remove_kept_note()}</span>
    </p>
    <label class="flex items-center gap-md">
      <Checkbox bind:checked={deleteFiles} />
      {m.remove_also_delete_files()}
    </label>
    {#if deleteFiles && wording.filesLine !== undefined}
      <p class="text-footnote text-danger max-medium:text-label">
        {wording.filesLine}
      </p>
    {/if}
  {/if}
</ConfirmDialog>
