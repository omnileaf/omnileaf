<script lang="ts">
  import type { FolderKind } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";
  import { rescanReport } from "./rescan-report";
  import type { RescanStatus } from "./rescans.svelte";

  let { status, kind }: { status: RescanStatus; kind: FolderKind } = $props();

  const progressTitleId = $props.id();
  const progressCountId = `${progressTitleId}-count`;

  const shown = $derived(
    status.kind !== "idle" && status.folder.kind === kind ? status : undefined,
  );

  const lines = $derived.by((): readonly string[] => {
    switch (shown?.kind) {
      case undefined:
      case "finding":
      case "reading":
        return [];
      case "failed":
        return [m.library_rescan_failed({ name: folderTitle(shown.folder) })];
      case "finished":
        return rescanReport(shown.folder, shown.outcome);
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
  {#if shown?.kind === "finding"}
    <progress aria-labelledby={progressTitleId} class="mbs-sm progress-track"
    ></progress>
  {:else if shown?.kind === "reading"}
    <progress
      aria-labelledby={progressTitleId}
      aria-describedby={progressCountId}
      class="mbs-sm progress-track"
      max={shown.total}
      value={shown.scanned}
    ></progress>
    <p id={progressCountId} class="mbs-xs text-caption text-muted">
      {m.library_scan_progress({
        scanned: shown.scanned,
        total: shown.total,
      })}
    </p>
  {/if}
</div>
