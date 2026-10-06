<script lang="ts">
  import { Trash } from "@lucide/svelte";

  import type { LibraryFolder } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import { ICON_SIZE } from "./icon-size";

  let {
    folder,
    onConfirm,
    onCancel,
  }: {
    folder: LibraryFolder | undefined;
    onConfirm: (folder: LibraryFolder) => void;
    onCancel: () => void;
  } = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (folder !== undefined && dialog?.open === false) {
      dialog.showModal();
    } else if (folder === undefined && dialog?.open === true) {
      dialog.close();
    }
  });
</script>

<dialog
  bind:this={dialog}
  role="alertdialog"
  aria-labelledby="remove-folder-title"
  aria-describedby="remove-folder-body"
  class="m-auto flex-col gap-md bg-sheet p-xl text-foreground backdrop:bg-scrim open:flex max-medium:mbe-none max-medium:rounded-ss-sheet max-medium:rounded-se-sheet max-medium:pbe-page-bottom max-medium:inline-full max-medium:max-inline-full medium:rounded-sheet medium:shadow-dialog medium:inline-dialog"
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
>
  {#if folder !== undefined}
    <span
      class="flex items-center justify-center rounded-control bg-danger-soft text-danger block-icon-badge inline-icon-badge"
    >
      <Trash size={ICON_SIZE} aria-hidden="true" />
    </span>
    <h2 id="remove-folder-title" class="text-title font-bold">
      {m.library_remove_folder_title({ name: folder.name })}
    </h2>
    <p id="remove-folder-body" class="text-muted">
      {m.library_remove_folder_body()}
    </p>
    <div
      class="mbs-sm flex flex-col gap-sm medium:flex-row-reverse medium:justify-start"
    >
      <button
        type="button"
        class="rounded-full bg-danger px-lg font-semibold text-on-danger transition-colors min-block-touch-target hover:bg-danger-hover active:bg-danger-pressed motion-safe:duration-fade motion-safe:ease-out medium:rounded-control"
        onclick={() => {
          onConfirm(folder);
        }}
      >
        {m.library_remove_folder_label({ name: folder.name })}
      </button>
      <button
        type="button"
        class="rounded-full border border-border px-lg font-semibold transition-colors min-block-touch-target hover:bg-hover active:bg-pressed motion-safe:duration-fade motion-safe:ease-out medium:rounded-control"
        onclick={onCancel}
      >
        {m.library_remove_folder_cancel()}
      </button>
    </div>
  {/if}
</dialog>
