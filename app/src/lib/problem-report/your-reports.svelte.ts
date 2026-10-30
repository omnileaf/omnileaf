import type {
  ProblemReportStatus,
  ReportReview,
  SentReportKey,
} from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

import type { ShareWay } from "./report-sharing.svelte";

const PREFERENCE_KEY = "omnileaf.yourReports";
const SHARE_WAYS: readonly ShareWay[] = ["send", "github", "copy", "save"];
const ANSWERED: readonly ReportReview["kind"][] = [
  "published",
  "duplicate",
  "closed",
];

export interface KeptReport {
  readonly code: string;
  readonly madeAtMs: number;
  readonly way?: ShareWay;
  readonly statusKey?: string;
  readonly lastReview?: ReportReview;
}

export function isAnswered(report: KeptReport): boolean {
  return (
    report.lastReview !== undefined && ANSWERED.includes(report.lastReview.kind)
  );
}

function isShareWay(value: unknown): value is ShareWay {
  return SHARE_WAYS.some((way) => way === value);
}

function reviewOf(value: unknown): ReportReview | undefined {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return undefined;
  }
  switch (value.kind) {
    case "received":
    case "reviewing":
    case "closed":
    case "unknown":
      return { kind: value.kind };
    case "published":
    case "duplicate":
      return "issue" in value && typeof value.issue === "number"
        ? { kind: value.kind, issue: value.issue }
        : undefined;
    default:
      return undefined;
  }
}

function keptReportOf(value: unknown): KeptReport | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("code" in value) ||
    typeof value.code !== "string" ||
    !("madeAtMs" in value) ||
    typeof value.madeAtMs !== "number"
  ) {
    return undefined;
  }
  const way = "way" in value && isShareWay(value.way) ? value.way : undefined;
  const statusKey =
    "statusKey" in value && typeof value.statusKey === "string"
      ? value.statusKey
      : undefined;
  const lastReview =
    "lastReview" in value ? reviewOf(value.lastReview) : undefined;
  return {
    code: value.code,
    madeAtMs: value.madeAtMs,
    ...(way === undefined ? {} : { way }),
    ...(statusKey === undefined ? {} : { statusKey }),
    ...(lastReview === undefined ? {} : { lastReview }),
  };
}

function storedReports(stored: string | null): KeptReport[] {
  try {
    const read: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(read)
      ? read.flatMap((value) => keptReportOf(value) ?? [])
      : [];
  } catch {
    return [];
  }
}

export class YourReports {
  reports: readonly KeptReport[] = $state([]);

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    this.reports = storedReports(this.#stored.read());
  }

  keep(report: KeptReport): void {
    const kept = this.reports.find(({ code }) => code === report.code);
    if (kept === undefined) {
      this.#write([report, ...this.reports]);
      return;
    }
    const { statusKey } = report;
    if (statusKey === undefined || kept.statusKey !== undefined) {
      return;
    }
    this.#write(
      this.reports.map((earlier) =>
        earlier.code === report.code
          ? { ...earlier, way: "send", statusKey }
          : earlier,
      ),
    );
  }

  sentKeys(): SentReportKey[] {
    return this.reports.flatMap(({ code, way, statusKey, lastReview }) =>
      way === "send" &&
      statusKey !== undefined &&
      lastReview?.kind !== "published"
        ? [{ code, statusKey }]
        : [],
    );
  }

  noteReviews(statuses: readonly ProblemReportStatus[]): void {
    const heard = statuses.filter(({ review }) => review.kind !== "unknown");
    if (heard.length === 0) {
      return;
    }
    this.#write(
      this.reports.map((report) => {
        const lastReview = heard.find(
          ({ code }) => code === report.code,
        )?.review;
        return lastReview === undefined ? report : { ...report, lastReview };
      }),
    );
  }

  #write(reports: readonly KeptReport[]): void {
    this.reports = reports;
    this.#stored.writeIfPossible(JSON.stringify(reports));
  }
}

export function yourReportsForDocument(): YourReports {
  return new YourReports(browserPreferenceStore());
}
