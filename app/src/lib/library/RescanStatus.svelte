<script lang="ts">
  import type { FolderKind, LibraryFolder } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";
  import { rescanReport } from "./rescan-report";
  import type { RescanStatus } from "./rescans.svelte";
  import ScanProgressBar from "./ScanProgressBar.svelte";

  let {
    status,
    kind,
    onRemoveBooks,
  }: {
    status: RescanStatus;
    kind: FolderKind;
    onRemoveBooks: (folder: LibraryFolder) => void;
  } = $props();

  const progressTitleId = $props.id();

  const shown = $derived(
    status.kind !== "idle" && status.folder.kind === kind ? status : undefined,
  );

  const offersRemovingBooks = $derived(
    (shown?.kind === "finished" && shown.outcome.kind === "foundEmpty") ||
      shown?.kind === "removalFailed",
  );

  const lines = $derived.by((): readonly string[] => {
    switch (shown?.kind) {
      case undefined:
      case "finding":
      case "reading":
      case "removingBooks":
        return [];
      case "failed":
        return [m.library_rescan_failed({ name: folderTitle(shown.folder) })];
      case "finished":
        return rescanReport(shown.folder, shown.outcome);
      case "removalFailed":
        return [
          m.library_remove_books_failed({ name: folderTitle(shown.folder) }),
        ];
      case "putBackFailed":
        return [
          m.library_put_back_books_failed({ name: folderTitle(shown.folder) }),
        ];
    }
  });
</script>

<div class="mbs-sm px-xs">
  <div role="status">
    {#if shown?.kind === "finding" || shown?.kind === "reading"}
      <p id={progressTitleId} class="font-semibold">
        {m.library_rescan_checking({ name: folderTitle(shown.folder) })}
      </p>
    {/if}
    {#each lines as line (line)}
      <p>{line}</p>
    {/each}
  </div>
  {#if shown?.kind === "finding" || shown?.kind === "reading"}
    <ScanProgressBar step={shown} titleId={progressTitleId} />
  {/if}
  {#if offersRemovingBooks && shown !== undefined}
    {@const folder = shown.folder}
    <button
      type="button"
      class="mbs-sm rounded-full border border-current/35 px-lg text-detail font-bold transition-control min-block-touch-target hover:bg-hover active:bg-pressed medium:rounded-control desktop:rounded-control desktop:px-md desktop:min-block-compact-button"
      onclick={() => {
        onRemoveBooks(folder);
      }}
    >
      {m.library_remove_books()}
    </button>
  {/if}
</div>
