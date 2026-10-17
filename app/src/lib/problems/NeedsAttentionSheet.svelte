<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { NeedsAttention, Problem } from "./needs-attention.svelte";
  import NeedsAttentionList from "./NeedsAttentionList.svelte";

  const ICON_SIZE = 18;

  let {
    attention,
    usesStandIns,
    onFix,
  }: {
    attention: NeedsAttention;
    usesStandIns: boolean;
    onFix: (problem: Problem) => void;
  } = $props();

  function close(): void {
    attention.hide();
  }
</script>

<Dialog.Root
  bind:open={
    () => attention.isShown,
    (open: boolean) => {
      if (!open) {
        close();
      }
    }
  }
>
  <ModalContent
    wideClass="inset-none m-auto flex flex-col gap-lg overflow-hidden rounded-panel border border-dialog-edge bg-card px-sheet-inline py-sheet-inline text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit"
    phoneClass="gap-lg px-sheet-inline pbs-sheet-gap pbe-sheet-bottom"
    onDismiss={close}
  >
    <div class="flex items-center gap-md">
      <span
        aria-hidden="true"
        class="flex shrink-0 items-center justify-center rounded-full bg-chip block-reader-dense inline-reader-dense"
      >
        <CircleAlert size={ICON_SIZE} />
      </span>
      <DialogTitle class="text-title font-bold">
        {m.attention_title()}
      </DialogTitle>
    </div>
    <div class="overflow-auto min-block-none">
      <NeedsAttentionList
        problems={attention.problems}
        {usesStandIns}
        onFix={(problem: Problem) => {
          close();
          onFix(problem);
        }}
      />
    </div>
  </ModalContent>
</Dialog.Root>
