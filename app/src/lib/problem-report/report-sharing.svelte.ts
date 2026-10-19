import type { commands, IpcError } from "#lib/ipc/bindings.ts";

export type ShareBackend = Pick<
  typeof commands,
  "copyProblemReport" | "openProblemReportIssue"
>;

export type ShareWay = "github" | "copy";

type Shared =
  { status: "ok"; data: null } | { status: "error"; error: IpcError };

const WAYS = {
  github: (backend) => backend.openProblemReportIssue(),
  copy: (backend) => backend.copyProblemReport(),
} satisfies Record<ShareWay, (backend: ShareBackend) => Promise<Shared>>;

export class ReportSharing {
  failure: ShareWay | undefined = $state();

  constructor(
    private readonly backend: ShareBackend,
    private readonly onShared: (way: ShareWay) => void,
  ) {}

  async share(way: ShareWay): Promise<void> {
    this.failure = undefined;
    const shared = await WAYS[way](this.backend);
    if (shared.status === "error") {
      this.failure = way;
      return;
    }
    this.onShared(way);
  }
}
