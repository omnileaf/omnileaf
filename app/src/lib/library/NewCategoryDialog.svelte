<script lang="ts">
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  let {
    isOpen,
    onAdd,
    onClose,
  }: {
    isOpen: boolean;
    onAdd: (name: string) => void;
    onClose: () => void;
  } = $props();

  let typed = $state("");
  const fieldId = $props.id();

  function add(): void {
    const name = typed.trim();
    typed = "";
    if (name === "") {
      onClose();
      return;
    }
    onAdd(name);
  }
</script>

<Dialog.Root
  bind:open={
    () => isOpen,
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
          {m.library_tabs_new_category()}
        </DialogTitle>
        <label for={fieldId} class="text-detail font-medium">
          {m.library_tabs_category_name()}
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
              add();
            }
          }}
          class="flex-none rounded-shadcn-control border border-field bg-input-fill px-md text-label shadow-raised block-pointer-button touch:text-body touch:block-touch-target"
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
            onclick={add}
          >
            {m.library_tabs_add()}
          </Button>
        </div>
      </div>
    {/snippet}
  </ModalContent>
</Dialog.Root>
