<script lang="ts">
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import type { ChangeKind, VersionNotes } from "#lib/ipc/bindings.ts";
  import { ANDROID_FILTER_SHEET } from "#lib/library/filter-sheet-look.ts";
  import { lastShown } from "#lib/page/last-shown.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { ANDROID_LIST_HEADING } from "#lib/settings/android-flush-look.ts";

  import { firstChangeGroups } from "./change-groups.ts";

  const MOST_NOTES_SHOWN = 5;

  const HEADINGS = {
    breaking: m.whats_new_kind_breaking,
    sec: m.whats_new_kind_sec,
    feat: m.whats_new_kind_feat,
    perf: m.whats_new_kind_perf,
    fix: m.whats_new_kind_fix,
  } satisfies Record<ChangeKind, () => string>;

  let {
    notes,
    onSeeAll,
    onClose,
  }: {
    notes: VersionNotes | undefined;
    onSeeAll: () => void;
    onClose: () => void;
  } = $props();

  const shown = lastShown(() => notes);
  const groups = $derived(
    shown.current === undefined
      ? []
      : firstChangeGroups(shown.current, MOST_NOTES_SHOWN),
  );
</script>

<Dialog.Root
  bind:open={
    () => notes !== undefined,
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
      }
    }
  }
>
  <ModalContent
    wideClass="inset-none m-auto flex flex-col overflow-hidden rounded-panel border border-dialog-edge bg-card text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit pbs-lg"
    phoneClass="max-block-dialog-limit"
    onDismiss={onClose}
  >
    <div class={ANDROID_FILTER_SHEET.header}>
      <DialogTitle class={ANDROID_FILTER_SHEET.title}>
        {m.whats_new_in({ version: shown.current?.version ?? "" })}
      </DialogTitle>
    </div>
    <div class={ANDROID_FILTER_SHEET.body}>
      {#each groups as { kind, summaries } (kind)}
        <h3 class="{ANDROID_LIST_HEADING} px-lg">{HEADINGS[kind]()}</h3>
        <ul
          class="flex list-disc flex-col ps-2xl pe-lg pbe-sm marker:text-muted"
        >
          {#each summaries as summary, index (index)}
            <li lang="en" dir="ltr" class="py-xs ps-xs text-body">
              {summary}
            </li>
          {/each}
        </ul>
      {/each}
    </div>
    <div
      class="flex justify-end gap-sm px-lg pbs-sm pbe-native-sheet-foot-bottom"
    >
      <Button type="button" variant="plain" onclick={onSeeAll}>
        {m.whats_new_see_all()}
      </Button>
      <Button type="button" variant="primary" onclick={onClose}>
        {m.whats_new_got_it()}
      </Button>
    </div>
  </ModalContent>
</Dialog.Root>
