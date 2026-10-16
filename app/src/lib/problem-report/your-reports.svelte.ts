import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const PREFERENCE_KEY = "omnileaf.yourReports";

export interface KeptReport {
  readonly code: string;
  readonly madeAtMs: number;
}

function isKeptReport(value: unknown): value is KeptReport {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    "madeAtMs" in value &&
    typeof value.madeAtMs === "number"
  );
}

function storedReports(stored: string | null): KeptReport[] {
  try {
    const read: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(read) ? read.filter(isKeptReport) : [];
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
    if (this.reports.some((kept) => kept.code === report.code)) {
      return;
    }
    this.reports = [report, ...this.reports];
    this.#stored.writeIfPossible(JSON.stringify(this.reports));
  }
}

export function yourReportsForDocument(): YourReports {
  return new YourReports(browserPreferenceStore());
}
