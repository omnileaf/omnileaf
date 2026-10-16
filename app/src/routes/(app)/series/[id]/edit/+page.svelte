<script lang="ts">
  import { X } from "@lucide/svelte";
  import { untrack } from "svelte";

  import { afterNavigate, beforeNavigate, goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { realLook } from "#lib/library/series-look.ts";
  import { getNotices, type UndoOffer } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    changesBetween,
    type DetailDraft,
  } from "#lib/series/detail-edits.ts";
  import {
    type DetailsBeingEdited,
    detailsToEdit,
    saveDetails,
  } from "#lib/series/details-to-edit.ts";
  import DiscardDetailsDialog from "#lib/series/DiscardDetailsDialog.svelte";
  import EditDetailsFields from "#lib/series/EditDetailsFields.svelte";
  import type { EditedSeries } from "#lib/series/edited-series.ts";
  import { seriesIdIn } from "#lib/series/series-id.ts";

  import type { PageProps } from "./$types";

  const CLOSE_ICON_SIZE = 24;

  let { data }: PageProps = $props();

  const notices = getNotices();

  let series = $state<EditedSeries | undefined>();
  let editing = $state<DetailsBeingEdited | undefined>();
  let isAsking = $state(false);
  let hasPageBehind = false;
  let isLeavingForGood = false;
  let leaveAgain: (() => void) | undefined;

  const changed = $derived(
    editing === undefined ? [] : changesBetween(editing.opened, editing.draft),
  );

  afterNavigate(({ from }) => {
    hasPageBehind = from !== null;
  });

  beforeNavigate((navigation) => {
    if (
      isLeavingForGood ||
      changed.length === 0 ||
      navigation.type === "leave"
    ) {
      return;
    }
    navigation.cancel();
    if (navigation.type === "popstate") {
      const { delta } = navigation;
      leaveAgain = () => {
        history.go(delta);
      };
    } else {
      const { to } = navigation;
      leaveAgain = () => {
        if (to !== null) {
          void goto(to.url);
        }
      };
    }
    isAsking = true;
  });

  $effect(() => {
    const id = seriesIdIn(data.id);
    untrack(() => {
      if (id !== undefined) {
        void load(id);
      }
    });
  });

  async function load(id: EditedSeries["id"]): Promise<void> {
    const [overview, read] = await Promise.all([
      commands.seriesOverview(id),
      detailsToEdit(id),
    ]);
    if (overview.status !== "ok" || read.kind === "failed") {
      reportError(overview.status === "ok" ? read : overview.error);
      return;
    }
    series = { id, ...realLook(overview.data) };
    editing = read.editing;
  }

  function backToSeries(): void {
    if (hasPageBehind) {
      history.back();
      return;
    }
    void goto(resolve("/(app)/series/[id]", { id: data.id }), {
      replaceState: true,
    });
  }

  async function save(): Promise<void> {
    if (series === undefined || editing === undefined) {
      return;
    }
    if (!(await saveDetails(series.id, editing, notices))) {
      return;
    }
    isLeavingForGood = true;
    backToSeries();
  }
</script>

<div class="flex flex-1 flex-col bg-background min-block-none">
  <header
    class="flex shrink-0 items-center gap-xs ps-safe-start pe-safe-end pbs-safe-top"
  >
    <div class="flex flex-1 items-center gap-xs p-sm min-block-row">
      <Button
        type="button"
        look="icon"
        aria-label={m.edit_details_close()}
        class="relative block-touch-target inline-touch-target hover:bg-hover active:bg-pressed"
        onclick={backToSeries}
      >
        <X size={CLOSE_ICON_SIZE} aria-hidden="true" />
      </Button>
      <h1 class="flex-1 text-bar-title" tabindex="-1">
        {m.series_edit_details()}
      </h1>
      <Button
        type="button"
        look="filled"
        disabled={editing === undefined}
        class="rounded-full px-lg font-semibold min-block-touch-target"
        onclick={() => {
          void save();
        }}
      >
        {m.edit_details_save()}
      </Button>
    </div>
  </header>
  <div class="flex-1 overflow-y-auto ps-safe-start pe-safe-end pbe-safe-bottom">
    <div class="px-lg pbe-xl">
      <div class="flex flex-col gap-md">
        <p class="text-label text-muted">{m.edit_details_intro()}</p>
        {#if editing !== undefined}
          <EditDetailsFields
            details={editing.details}
            draft={editing.draft}
            onDraft={(draft: DetailDraft) => {
              if (editing !== undefined) {
                editing.draft = draft;
              }
            }}
            offerUndo={(offer: UndoOffer) => {
              notices.offerUndo(offer);
            }}
          />
        {/if}
      </div>
    </div>
  </div>
</div>
{#if series !== undefined}
  <DiscardDetailsDialog
    isOpen={isAsking}
    {series}
    {changed}
    {coverUrl}
    onDiscard={() => {
      isAsking = false;
      isLeavingForGood = true;
      leaveAgain?.();
    }}
    onKeepEditing={() => {
      isAsking = false;
    }}
  />
{/if}
