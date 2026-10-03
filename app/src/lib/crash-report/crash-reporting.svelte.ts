import { DetailsCopying } from "$lib/copying/details-copying.svelte";
import type { commands, InterfaceError, IpcErrorCode } from "$lib/ipc/bindings";

import type { CrashReportChoice, CrashReportSetting } from "./choice.svelte";

export type CrashReportBackend = Pick<
  typeof commands,
  | "offerSavedCrashReport"
  | "offerInterfaceErrorReport"
  | "sendCrashReport"
  | "copyCrashReport"
  | "declineCrashReport"
>;

export type CrashMoment = "lastTime" | "now";

export type SendFailure = "browserUnavailable" | "notSent";

export type CrashReportPrompt =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "asking";
      readonly details: string;
      readonly moment: CrashMoment;
      readonly failure: SendFailure | undefined;
    };

const HIDDEN: CrashReportPrompt = { kind: "hidden" };

/** Offers crash reports as the person's choice says: asking first, sending without asking, or never. */
export class CrashReporting {
  prompt: CrashReportPrompt = $state(HIDDEN);

  readonly copying: DetailsCopying;

  constructor(
    private readonly backend: CrashReportBackend,
    private readonly setting: CrashReportSetting,
  ) {
    this.copying = new DetailsCopying(backend.copyCrashReport);
  }

  async offerSaved(): Promise<void> {
    const saved = await this.backend.offerSavedCrashReport();
    if (saved.status === "ok" && saved.data !== null) {
      await this.follow(saved.data.details, "lastTime");
    }
  }

  async offerInterfaceError(error: InterfaceError): Promise<void> {
    const offered = await this.backend.offerInterfaceErrorReport(error);
    if (offered.status === "ok" && this.prompt.kind === "hidden") {
      await this.follow(offered.data.details, "now");
    }
  }

  async sendThisTime(): Promise<void> {
    await this.sendShown();
  }

  async sendAlways(): Promise<void> {
    if (await this.sendShown()) {
      this.setting.choose("always");
    }
  }

  async decline(): Promise<void> {
    this.prompt = HIDDEN;
    await this.backend.declineCrashReport();
  }

  private async follow(details: string, moment: CrashMoment): Promise<void> {
    const asking = {
      kind: "asking",
      details,
      moment,
      failure: undefined,
    } as const;
    const outcomes = {
      ask: () => {
        this.prompt = asking;
        return Promise.resolve();
      },
      always: async () => {
        const failure = await this.send();
        if (failure !== undefined) {
          this.prompt = { ...asking, failure };
        }
      },
      never: async () => {
        await this.backend.declineCrashReport();
      },
    } satisfies Record<CrashReportChoice, () => Promise<void>>;
    await outcomes[this.setting.choice]();
  }

  private async sendShown(): Promise<boolean> {
    const failure = await this.send();
    if (failure === undefined) {
      this.prompt = HIDDEN;
      return true;
    }
    if (this.prompt.kind === "asking") {
      this.prompt = { ...this.prompt, failure };
    }
    return false;
  }

  private async send(): Promise<SendFailure | undefined> {
    const sent = await this.backend.sendCrashReport();
    return sent.status === "ok" ? undefined : failureOf(sent.error.code);
  }
}

function failureOf(code: IpcErrorCode): SendFailure {
  return code === "browserUnavailable" ? "browserUnavailable" : "notSent";
}
