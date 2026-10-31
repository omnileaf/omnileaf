import { CircleAlert, Trash } from "@lucide/svelte";

import type {
  FileRemoval,
  RemovalReport,
  RemovalTarget,
} from "#lib/ipc/bindings.ts";
import type { Notices } from "#lib/notices/notices.ts";
import { m } from "#lib/paraglide/messages.js";
import type { SeriesId } from "#lib/series/series-id.ts";

const NAMES_SHOWN = 3;

export function seriesTargets(series: readonly SeriesId[]): RemovalTarget[] {
  return series.map((id) => ({ kind: "series", id }));
}

function stayed({ outcome }: FileRemoval): boolean {
  return outcome.kind === "failed";
}

export function noteRemoval(notices: Notices, report: RemovalReport): void {
  const stuck = report.files.filter(stayed);
  if (stuck.length > 0) {
    const names = stuck.slice(0, NAMES_SHOWN).map(({ name }) => name);
    const more = stuck.length - names.length;
    notices.show({
      tone: "warning",
      icon: CircleAlert,
      title: m.remove_failed_title({ count: stuck.length }),
      body: m.remove_failed_body({
        names:
          more > 0 ? `${names.join(", ")} +${String(more)}` : names.join(", "),
      }),
    });
    return;
  }
  notices.show({
    tone: "plain",
    icon: Trash,
    title:
      report.removedSeries > 0
        ? m.remove_removed_series({ count: report.removedSeries })
        : m.remove_removed_books({ count: report.removedBooks }),
  });
}
