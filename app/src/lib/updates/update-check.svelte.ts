import {
  type AppInfo,
  type CheckedForUpdates,
  type CheckOutcome,
  commands,
  type IpcError,
  type NewerRelease,
  type UpdateStatus,
} from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

type Answered<Data> =
  | { readonly status: "ok"; readonly data: Data }
  | { readonly status: "error"; readonly error: IpcError };

export interface UpdateAsks {
  readonly status: () => Promise<Answered<UpdateStatus>>;
  readonly check: () => Promise<Answered<CheckedForUpdates>>;
  readonly checkIfDue: () => Promise<Answered<CheckedForUpdates>>;
  readonly setAutomatic: (isOn: boolean) => Promise<Answered<UpdateStatus>>;
  readonly snooze: (version: string) => Promise<Answered<UpdateStatus>>;
  readonly skip: (version: string) => Promise<Answered<UpdateStatus>>;
  readonly openReleasePage: () => Promise<Answered<null>>;
}

export type CheckPhase = "resting" | "checking" | "failed";

const UPDATE_ASKS: UpdateAsks = {
  status: commands.updateStatus,
  check: commands.checkForUpdates,
  checkIfDue: commands.checkForUpdatesIfDue,
  setAutomatic: commands.setAutomaticUpdateCheck,
  snooze: commands.snoozeUpdate,
  skip: commands.skipUpdate,
  openReleasePage: commands.openReleasePage,
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
  hasOpeningFailed = $state(false);

  constructor(
    private readonly onFailure: (error: IpcError) => void,
    private readonly asks: UpdateAsks,
  ) {}

  get isAutomatic(): boolean {
    return this.status?.isAutomatic ?? false;
  }

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

  async checkIfDue(): Promise<void> {
    const checked = await this.asks.checkIfDue();
    if (checked.status === "error") {
      this.#report(checked.error);
      return;
    }
    this.status = checked.data.status;
  }

  async setAutomatic(isOn: boolean): Promise<void> {
    const chosen = await this.asks.setAutomatic(isOn);
    if (chosen.status === "error") {
      this.#report(chosen.error);
      return;
    }
    this.status = chosen.data;
    if (isOn) {
      await this.checkIfDue();
    }
  }

  get shownRelease(): NewerRelease | undefined {
    const release = this.status?.release;
    return release?.kind === "newer" && release.notice === "shown"
      ? release
      : undefined;
  }

  async snooze(version: string): Promise<void> {
    this.#follow(await this.asks.snooze(version));
  }

  async skip(version: string): Promise<void> {
    this.#follow(await this.asks.skip(version));
  }

  async openReleasePage(): Promise<void> {
    const opened = await this.asks.openReleasePage();
    this.hasOpeningFailed =
      opened.status === "error" && opened.error.code === "browserUnavailable";
    if (opened.status === "error" && !this.hasOpeningFailed) {
      this.#report(opened.error);
    }
  }

  #follow(chosen: Answered<UpdateStatus>): void {
    if (chosen.status === "error") {
      this.#report(chosen.error);
      return;
    }
    this.status = chosen.data;
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
  appUpdateCheck ??= new UpdateCheck((error) => {
    reportError(error);
  }, UPDATE_ASKS);
  return appUpdateCheck;
}
