import type {
  commands,
  IpcError,
  IpcErrorCode,
  SavedProblemReport,
} from "#lib/ipc/bindings.ts";
import type { LocalDay } from "#lib/history/local-date.ts";

export type ShareBackend = Pick<
  typeof commands,
  | "sendProblemReport"
  | "copyProblemReport"
  | "openProblemReportIssue"
  | "saveProblemReport"
>;

export type ShareWay = "send" | "github" | "copy" | "save";

export type Shared =
  | { readonly way: "send" }
  | { readonly way: "github" }
  | { readonly way: "copy" }
  | { readonly way: "save"; readonly saved: SavedProblemReport };

export interface ShareFailure {
  readonly way: ShareWay;
  readonly code: IpcErrorCode;
}

interface ShareRequest {
  readonly today: LocalDay;
  readonly replyTo: string | null;
}

type Outcome =
  { status: "ok"; data: Shared } | { status: "error"; error: IpcError };

type Answer<Data> =
  { status: "ok"; data: Data } | { status: "error"; error: IpcError };

function sharedAs<Data>(
  answer: Answer<Data>,
  shared: (data: Data) => Shared,
): Outcome {
  return answer.status === "ok"
    ? { status: "ok", data: shared(answer.data) }
    : answer;
}

function replyAddress(typed: string): string | null {
  const address = typed.trim();
  return address === "" ? null : address;
}

const WAYS = {
  send: async (backend, { replyTo }) =>
    sharedAs(await backend.sendProblemReport(replyTo), () => ({ way: "send" })),
  github: async (backend) =>
    sharedAs(await backend.openProblemReportIssue(), () => ({
      way: "github",
    })),
  copy: async (backend) =>
    sharedAs(await backend.copyProblemReport(), () => ({ way: "copy" })),
  save: async (backend, { today }) =>
    sharedAs(await backend.saveProblemReport(today), (saved) => ({
      way: "save",
      saved,
    })),
} satisfies Record<
  ShareWay,
  (backend: ShareBackend, request: ShareRequest) => Promise<Outcome>
>;

export class ReportSharing {
  replyTo = $state("");
  failure: ShareFailure | undefined = $state();

  constructor(
    private readonly backend: ShareBackend,
    private readonly today: () => LocalDay,
    private readonly onShared: (shared: Shared) => void,
  ) {}

  async share(way: ShareWay): Promise<void> {
    this.failure = undefined;
    const outcome = await WAYS[way](this.backend, {
      today: this.today(),
      replyTo: replyAddress(this.replyTo),
    });
    if (outcome.status === "error") {
      this.failure = { way, code: outcome.error.code };
      return;
    }
    this.onShared(outcome.data);
  }
}
