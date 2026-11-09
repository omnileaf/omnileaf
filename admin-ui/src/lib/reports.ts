import type { Listed, StatusKind } from "#lib/wire.ts";

export interface Tally {
  readonly label: string;
  readonly count: number;
}

export interface ReportFilter {
  readonly status?: StatusKind;
  readonly platform?: string;
  readonly version?: string;
  readonly search?: string;
}

const compareText = new Intl.Collator("en", { numeric: true }).compare;
const PRE_RELEASE_SEPARATOR = "-";

function splitVersion(version: string): {
  core: string;
  preRelease: string | undefined;
} {
  const [core = "", ...preRelease] = version.split(PRE_RELEASE_SEPARATOR);
  return {
    core,
    preRelease:
      preRelease.length === 0
        ? undefined
        : preRelease.join(PRE_RELEASE_SEPARATOR),
  };
}

export function compareVersions(a: string, b: string): number {
  const first = splitVersion(a);
  const second = splitVersion(b);
  const byCore = compareText(first.core, second.core);
  if (byCore !== 0) {
    return byCore;
  }
  if (first.preRelease === undefined || second.preRelease === undefined) {
    return (
      Number(first.preRelease === undefined) -
      Number(second.preRelease === undefined)
    );
  }
  return compareText(first.preRelease, second.preRelease);
}

function tally(labels: readonly string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count }));
}

export function countByStatus(
  reports: readonly Listed[],
): Record<StatusKind, number> {
  const counts: Record<StatusKind, number> = {
    received: 0,
    reviewing: 0,
    published: 0,
    duplicate: 0,
    closed: 0,
  };
  for (const report of reports) {
    counts[report.status.kind] += 1;
  }
  return counts;
}

export function countByPlatform(reports: readonly Listed[]): readonly Tally[] {
  return tally(reports.map((report) => report.platform)).sort(
    (a, b) => b.count - a.count || compareText(a.label, b.label),
  );
}

export function countByVersion(reports: readonly Listed[]): readonly Tally[] {
  return tally(reports.map((report) => report.version)).sort(
    (a, b) => b.count - a.count || compareVersions(b.label, a.label),
  );
}

const ISSUE_PREFIX = "#";

function issueOf(report: Listed): number | undefined {
  return "issue" in report.status ? report.status.issue : undefined;
}

function searchableText(report: Listed): string {
  const { code, platform, version, status } = report;
  return [code, platform, version, status.kind, issueOf(report)]
    .filter((part) => part !== undefined)
    .join(" ")
    .toLowerCase();
}

function searchTerms(search: string): string[] {
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== "" && term !== ISSUE_PREFIX);
}

function matchesTerm(report: Listed, term: string): boolean {
  if (!term.startsWith(ISSUE_PREFIX)) {
    return searchableText(report).includes(term);
  }
  const issue = issueOf(report);
  return (
    issue !== undefined && String(issue) === term.slice(ISSUE_PREFIX.length)
  );
}

export function filterReports(
  reports: readonly Listed[],
  filter: ReportFilter,
): readonly Listed[] {
  const terms = searchTerms(filter.search ?? "");
  return reports.filter(
    (report) =>
      (filter.status === undefined || report.status.kind === filter.status) &&
      (filter.platform === undefined || report.platform === filter.platform) &&
      (filter.version === undefined || report.version === filter.version) &&
      terms.every((term) => matchesTerm(report, term)),
  );
}

export function awaitingReview(reports: readonly Listed[]): readonly Listed[] {
  return reports
    .filter((report) => report.status.kind === "received")
    .sort((a, b) => a.receivedAt - b.receivedAt);
}

export function isFiltering(filter: ReportFilter): boolean {
  return (
    filter.status !== undefined ||
    filter.platform !== undefined ||
    filter.version !== undefined ||
    searchTerms(filter.search ?? "").length > 0
  );
}
