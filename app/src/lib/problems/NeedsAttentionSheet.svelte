<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    alertLook,
    CONTENT_DIALOG_PANEL,
    TODAYS_ALERT_LOOK,
  } from "#lib/components/ui/dialog/alert-look.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { NeedsAttention, Problem } from "./needs-attention.svelte";
  import NeedsAttentionList from "./NeedsAttentionList.svelte";
  import type { WordingContext } from "./problem-wording";

  const ICON_SIZE = 18;
  const TODAYS_PANEL =
    "inset-none m-auto flex flex-col gap-lg overflow-hidden rounded-panel border border-dialog-edge bg-card px-sheet-inline py-sheet-inline text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit";

  let {
    attention,
    context,
    onFix,
  }: {
    attention: NeedsAttention;
    context: WordingContext;
    onFix: (problem: Problem) => void;
  } = $props();

  const isWindows = currentPlatform() === "windows";
  const look = isWindows ? alertLook("windows") : TODAYS_ALERT_LOOK;

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
    wideClass={cn(
      isWindows ? CONTENT_DIALOG_PANEL : TODAYS_PANEL,
      look.surface,
    )}
    phoneLook={isWindows ? "dialog" : "drawer"}
    phoneClass={isWindows
      ? cn(CONTENT_DIALOG_PANEL, look.surface)
      : "gap-lg px-sheet-inline pbs-sheet-gap pbe-sheet-bottom"}
    phoneOverlayClass={look.scrim}
    wideOverlayClass={look.scrim}
    onDismiss={close}
  >
    <div class="flex items-center gap-md">
      <span
        aria-hidden="true"
        class={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-chip block-reader-dense inline-reader-dense",
          look.badge,
        )}
      >
        <CircleAlert size={ICON_SIZE} />
      </span>
      <DialogTitle class={cn("text-title font-bold", look.title)}>
        {m.attention_title()}
      </DialogTitle>
    </div>
    <div class="overflow-auto min-block-none">
      <NeedsAttentionList
        problems={attention.problems}
        {context}
        onFix={(problem: Problem) => {
          close();
          onFix(problem);
        }}
      />
    </div>
    {#if isWindows}
      <div class={cn("-mbe-xl flex justify-end", look.actions)}>
        <Button type="button" variant="primary" onclick={close}>
          {m.attention_close()}
        </Button>
      </div>
    {/if}
  </ModalContent>
</Dialog.Root>
