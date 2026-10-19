<script lang="ts">
  import { resolve } from "$app/paths";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { standInHistoryEntry } from "#lib/series/series-stand-ins.ts";

  import type { HistoryEntryActions } from "./history-entry-actions.ts";
  import type { HistoryGroupName } from "./history-groups.ts";
  import { historyLine, type WhenFormats } from "./history-line.ts";
  import HistoryEntryMenu from "./HistoryEntryMenu.svelte";
  import HistoryEntrySheet from "./HistoryEntrySheet.svelte";

  let {
    entry: listed,
    group,
    formats,
    usesStandIns,
    actions,
  }: {
    entry: HistoryEntry;
    group: HistoryGroupName;
    formats: WhenFormats;
    usesStandIns: boolean;
    actions: HistoryEntryActions;
  } = $props();

  const entry = $derived(usesStandIns ? standInHistoryEntry(listed) : listed);
  const cover = $derived(
    (usesStandIns ? standInLook : realLook)({
      id: listed.series,
      title: listed.seriesTitle,
      cover: listed.cover,
    }).cover,
  );
  const reached = $derived(
    entry.readTo.state === "page"
      ? {
          value: entry.readTo.page,
          max: entry.readTo.pageCount,
          label: m.history_page_of({
            page: entry.readTo.page,
            count: entry.readTo.pageCount,
          }),
        }
      : { value: 1, max: 1, label: m.history_finished() },
  );
</script>

<li class="flex items-center gap-xs py-xs">
  <a
    href={resolve("/read/[book]", { book: entry.book })}
    data-history-book={listed.book}
    class="flex flex-1 items-center gap-md rounded-control py-xs ps-xs min-inline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
  >
    <ListCover
      {cover}
      {coverUrl}
      class="shrink-0 rounded-history-cover inline-history-cover"
    />
    <span class="flex flex-col gap-2xs min-inline-none">
      <span class="line-clamp-2 text-small font-semibold wrap-break-word">
        {entry.seriesTitle}
      </span>
      <span
        class="line-clamp-2 text-detail wrap-break-word text-muted tabular-nums"
      >
        {historyLine(entry, group, formats)}
      </span>
      <Progress
        aria-label={reached.label}
        max={reached.max}
        value={reached.value}
        class="block-progress-compact inline-history-bar"
      />
    </span>
  </a>
  <HistoryEntrySheet {entry} {cover} {actions} />
  <HistoryEntryMenu {entry} {actions} />
</li>
