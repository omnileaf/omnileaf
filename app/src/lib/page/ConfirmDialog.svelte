<script lang="ts">
  import type { Snippet } from "svelte";

  import type { Glyph } from "./glyph";
  import HeaderBadge from "./HeaderBadge.svelte";

  const BUTTON =
    "rounded-full px-lg text-body font-semibold transition-control min-block-touch-button focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ios:max-medium:rounded-ios-button medium:rounded-button medium:text-label medium:min-block-pointer-target";

  let {
    isOpen,
    icon,
    title,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    children,
  }: {
    isOpen: boolean;
    icon: Glyph;
    title: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    children: Snippet;
  } = $props();

  const id = $props.id();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (isOpen && dialog?.open === false) {
      dialog.showModal();
    } else if (!isOpen && dialog?.open === true) {
      dialog.close();
    }
  });
</script>

<dialog
  bind:this={dialog}
  role="alertdialog"
  aria-labelledby={titleId}
  aria-describedby={bodyId}
  class="m-auto flex-col gap-lg bg-card px-sheet-inline text-foreground backdrop:bg-scrim open:flex max-medium:mbe-none max-medium:rounded-ss-confirm-sheet max-medium:rounded-se-confirm-sheet max-medium:pbs-sm max-medium:pbe-page-bottom max-medium:inline-full max-medium:max-inline-full medium:rounded-panel medium:border medium:border-dialog-edge medium:py-sheet-inline medium:shadow-dialog medium:inline-dialog"
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
>
  {#if isOpen}
    <span
      aria-hidden="true"
      class="self-center rounded-full bg-step-off block-sheet-handle-block inline-sheet-handle medium:hidden"
    ></span>
    <div class="flex items-center gap-md">
      <HeaderBadge {icon} tone="bg-danger-soft text-danger" />
      <h2
        id={titleId}
        class="text-dialog-title font-bold max-medium:text-sheet-title"
      >
        {title}
      </h2>
    </div>
    <div id={bodyId} class="flex flex-col gap-md">
      {@render children()}
    </div>
    <div
      class="mbs-xs flex flex-col-reverse gap-sheet-buttons medium:grid medium:grid-cols-2 medium:gap-sm"
    >
      <button
        type="button"
        class={[
          BUTTON,
          "bg-chip hover:tint-hover active:tint-pressed medium:border medium:border-border medium:bg-card",
        ]}
        onclick={onCancel}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        class={[
          BUTTON,
          "bg-danger text-on-danger hover:bg-danger-hover active:bg-danger-pressed",
        ]}
        onclick={onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  {/if}
</dialog>
