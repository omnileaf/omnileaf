import {
  type AppInfo,
  type CheckedForUpdates,
  type CheckOutcome,
  commands,
  type IpcError,
  type UpdateStatus,
} from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

type Answered<Data> =
  | { readonly status: "ok"; readonly data: Data }
  | { readonly status: "error"; readonly error: IpcError };

export interface UpdateAsks {
  readonly status: () => Promise<Answered<UpdateStatus>>;
  readonly check: () => Promise<Answered<CheckedForUpdates>>;
}

export type CheckPhase = "resting" | "checking" | "failed";

const UPDATE_ASKS: UpdateAsks = {
  status: commands.updateStatus,
  check: commands.checkForUpdates,
};

const FAILED_OUTCOMES: ReadonlySet<CheckOutcome> = new Set([
  "offline",
  "rateLimited",
  "failed",
]);

export function offersUpdateCheck(appInfo: AppInfo): boolean {
  return appInfo.checksForUpdates && appInfo.platform === "android";
}

export function checkHint(
  phase: CheckPhase,
  status: UpdateStatus | null,
): string | undefined {
  switch (phase) {
    case "checking":
      return m.about_update_checking();
    case "failed":
      return m.about_update_check_failed();
    case "resting":
      return releaseHint(status);
  }
}

function releaseHint(status: UpdateStatus | null): string | undefined {
  switch (status?.release.kind) {
    case undefined:
    case "unchecked":
      return undefined;
    case "upToDate":
      return m.about_up_to_date();
    case "newer":
      return m.about_update_available({ version: status.release.version });
  }
}

export class UpdateCheck {
  status: UpdateStatus | null = $state(null);
  phase: CheckPhase = $state("resting");

  constructor(
    private readonly onFailure: (error: IpcError) => void,
    private readonly asks: UpdateAsks,
  ) {}

  get hint(): string | undefined {
    return checkHint(this.phase, this.status);
  }

  async load(): Promise<void> {
    const known = await this.asks.status();
    if (known.status === "error") {
      this.#report(known.error);
      return;
    }
    this.status = known.data;
  }

  async check(): Promise<void> {
    if (this.phase === "checking") {
      return;
    }
    this.phase = "checking";
    const checked = await this.asks.check();
    if (checked.status === "error") {
      this.phase = "failed";
      this.#report(checked.error);
      return;
    }
    this.status = checked.data.status;
    this.phase = isFailure(checked.data.outcome) ? "failed" : "resting";
  }

  #report(error: IpcError): void {
    const { onFailure } = this;
    onFailure(error);
  }
}

function isFailure(outcome: CheckOutcome | null): boolean {
  return outcome !== null && FAILED_OUTCOMES.has(outcome);
}

let appUpdateCheck: UpdateCheck | undefined;

export function updateCheckForApp(): UpdateCheck {
  appUpdateCheck ??= new UpdateCheck(reportError, UPDATE_ASKS);
  return appUpdateCheck;
}
