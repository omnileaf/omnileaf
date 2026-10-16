import type {
  commands,
  IpcError,
  SavedProblemReport,
} from "#lib/ipc/bindings.ts";
import type { LocalDay } from "#lib/history/local-date.ts";

export type ShareBackend = Pick<
  typeof commands,
  "copyProblemReport" | "openProblemReportIssue" | "saveProblemReport"
>;

export type ShareWay = "github" | "copy" | "save";

export type Shared =
  | { readonly way: "github" }
  | { readonly way: "copy" }
  | { readonly way: "save"; readonly saved: SavedProblemReport };

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

const WAYS = {
  github: async (backend) =>
    sharedAs(await backend.openProblemReportIssue(), () => ({
      way: "github",
    })),
  copy: async (backend) =>
    sharedAs(await backend.copyProblemReport(), () => ({ way: "copy" })),
  save: async (backend, today) =>
    sharedAs(await backend.saveProblemReport(today), (saved) => ({
      way: "save",
      saved,
    })),
} satisfies Record<
  ShareWay,
  (backend: ShareBackend, today: LocalDay) => Promise<Outcome>
>;

export class ReportSharing {
  failure: ShareWay | undefined = $state();

  constructor(
    private readonly backend: ShareBackend,
    private readonly today: () => LocalDay,
    private readonly onShared: (shared: Shared) => void,
  ) {}

  async share(way: ShareWay): Promise<void> {
    this.failure = undefined;
    const outcome = await WAYS[way](this.backend, this.today());
    if (outcome.status === "error") {
      this.failure = way;
      return;
    }
    this.onShared(outcome.data);
  }
}
