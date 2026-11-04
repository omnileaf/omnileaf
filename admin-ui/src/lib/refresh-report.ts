import type { ReportStore } from "#lib/report-store.svelte.ts";
import type { ReportsStore } from "#lib/reports-store.svelte.ts";
import type { Status } from "#lib/wire.ts";

type ReportSource = Pick<ReportStore, "state">;
type ListTarget = Pick<ReportsStore, "apply">;

function listWhatIsShown(report: ReportSource, reports: ListTarget): void {
  if (report.state.kind === "ready") {
    reports.apply(report.state.detail.listed);
  }
}

export async function refreshReport(
  report: ReportSource & Pick<ReportStore, "refresh">,
  reports: ListTarget,
): Promise<void> {
  await report.refresh();
  listWhatIsShown(report, reports);
}

export async function reflectMove(
  report: ReportSource & Pick<ReportStore, "applyStatus" | "refreshQuietly">,
  reports: ListTarget,
  status: Status,
): Promise<void> {
  report.applyStatus(status);
  listWhatIsShown(report, reports);
  await report.refreshQuietly();
  listWhatIsShown(report, reports);
}
