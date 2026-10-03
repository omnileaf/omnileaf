import { DetailsCopying } from "$lib/copying/details-copying.svelte";
import type {
  commands,
  CrashOrigin,
  CrashReportOffer,
  InterfaceError,
  IpcErrorCode,
} from "$lib/ipc/bindings";

import type { CrashReportChoice, CrashReportSetting } from "./choice.svelte";

export type CrashReportBackend = Pick<
  typeof commands,
  | "offerSavedCrashReport"
  | "offerInterfaceErrorReport"
  | "sendCrashReport"
  | "copyCrashReport"
  | "declineCrashReport"
>;

export type SendFailure = "browserUnavailable" | "notSent";

export type CrashReportPrompt =
  | { readonly kind: "hidden" }
  | { readonly kind: "sending" }
  | {
      readonly kind: "asking";
      readonly details: string;
      readonly origin: CrashOrigin;
      readonly failure: SendFailure | undefined;
    };

const HIDDEN: CrashReportPrompt = { kind: "hidden" };
const SENDING: CrashReportPrompt = { kind: "sending" };

const SEND_OUTCOMES = {
  noCrashReport: undefined,
  browserUnavailable: "browserUnavailable",
  folderPickerUnavailable: "notSent",
  folderUnreadable: "notSent",
  clipboardUnavailable: "notSent",
  crashReportUnavailable: "notSent",
  internal: "notSent",
} as const satisfies Record<IpcErrorCode, SendFailure | undefined>;

/** Offers crash reports as the person's choice says: asking first, sending without asking, or never; interface errors at most once a session. */
export class CrashReporting {
  prompt: CrashReportPrompt = $state(HIDDEN);

  #interfaceErrorOffered = false;

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
      await this.follow(saved.data);
    }
  }

  async offerInterfaceError(error: InterfaceError): Promise<void> {
    if (this.#interfaceErrorOffered) {
      return;
    }
    this.#interfaceErrorOffered = true;
    const offered = await this.backend.offerInterfaceErrorReport(error);
    if (offered.status === "ok") {
      await this.follow(offered.data);
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

  private async follow({ details, origin }: CrashReportOffer): Promise<void> {
    if (this.prompt.kind !== "hidden") {
      return;
    }
    const asking = {
      kind: "asking",
      details,
      origin,
      failure: undefined,
    } as const;
    const outcomes = {
      ask: () => {
        this.prompt = asking;
        return Promise.resolve();
      },
      always: async () => {
        this.prompt = SENDING;
        const failure = await this.send();
        this.prompt = failure === undefined ? HIDDEN : { ...asking, failure };
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

function failureOf(code: IpcErrorCode): SendFailure | undefined {
  return SEND_OUTCOMES[code];
}
