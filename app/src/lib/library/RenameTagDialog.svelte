<script lang="ts">
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  let {
    tag,
    onRename,
    onClose,
  }: {
    tag: string | undefined;
    onRename: (tag: string, to: string) => void;
    onClose: () => void;
  } = $props();

  let typed = $derived(tag ?? "");
  const fieldId = $props.id();

  function rename(): void {
    const to = typed.trim();
    if (tag === undefined || to === "" || to === tag) {
      onClose();
      return;
    }
    onRename(tag, to);
  }
</script>

<Dialog.Root
  bind:open={
    () => tag !== undefined,
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
      }
    }
  }
>
  <ModalContent
    wideClass="inset-none m-auto flex flex-col gap-md overflow-hidden rounded-panel border border-dialog-edge bg-dialog p-lg text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit"
    phoneClass="inset-bs-sheet-top block-auto"
    onDismiss={onClose}
  >
    {#snippet children(view)}
      <div
        class={[
          "flex flex-col gap-md",
          view === "wide" ? "" : "px-sheet-inline pbs-md pbe-sheet-bottom",
        ]}
      >
        <DialogTitle class="text-title font-bold">
          {m.manage_tags_rename({ tag: tag ?? "" })}
        </DialogTitle>
        <label for={fieldId} class="text-detail font-medium">
          {m.manage_tags_tag()}
        </label>
        <Input
          id={fieldId}
          value={typed}
          oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
            typed = event.currentTarget.value;
          }}
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === "Enter") {
              event.preventDefault();
              rename();
            }
          }}
          class="rounded-control border border-border bg-background px-md text-body block-pointer-button touch:block-touch-target"
        />
        <div class="flex gap-sm">
          <Button
            type="button"
            look="dialog-secondary"
            class="flex-1"
            onclick={onClose}
          >
            {m.library_cancel()}
          </Button>
          <Button
            type="button"
            look="dialog-primary"
            class="flex-1"
            onclick={rename}
          >
            {m.manage_tags_rename_action()}
          </Button>
        </div>
      </div>
    {/snippet}
  </ModalContent>
</Dialog.Root>
