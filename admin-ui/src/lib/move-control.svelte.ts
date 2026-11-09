import type { Api } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";
import { moveFailure } from "#lib/move-failure.ts";
import { isBusy, type MoveState } from "#lib/move-state.ts";
import { planMove, statusOf } from "#lib/moves.ts";
import { fillTemplate } from "#lib/template.ts";
import type { MoveRequest, MoveTarget, ReportCode, Status } from "#lib/wire.ts";

export interface MoveDependencies {
  readonly api: Pick<Api, "move">;
  readonly code: ReportCode;
  readonly csrf: string;
  readonly refresh: () => Promise<void>;
  readonly moved: (status: Status) => Promise<void>;
}

function announcementFor(request: MoveRequest): string {
  const status = copy.status[request.status];
  return "issue" in request
    ? fillTemplate(copy.moves.movedWithIssue, {
        status,
        issue: request.issue,
      })
    : fillTemplate(copy.moves.moved, { status });
}

export class MoveControl {
  readonly #dependencies: MoveDependencies;
  #state: MoveState = $state.raw({ kind: "idle" });
  #issueDraft = $state("");

  constructor(dependencies: MoveDependencies) {
    this.#dependencies = dependencies;
  }

  get state(): MoveState {
    return this.#state;
  }

  get issueDraft(): string {
    return this.#issueDraft;
  }

  changeDraft(text: string): void {
    this.#issueDraft = text;
  }

  async choose(target: MoveTarget): Promise<void> {
    if (isBusy(this.#state)) {
      return;
    }
    const plan = planMove(target, this.#issueDraft);
    switch (plan.kind) {
      case "send":
        return this.#send(plan.request);
      case "confirm":
        this.#state = { kind: "confirming", request: plan.request };
        return;
      case "issueNeeded":
        this.#state = { kind: "issueInvalid", message: plan.message };
        return;
    }
  }

  async confirm(): Promise<void> {
    if (this.#state.kind === "confirming") {
      await this.#send(this.#state.request);
    }
  }

  cancel(): void {
    if (this.#state.kind === "confirming") {
      this.#state = { kind: "idle" };
    }
  }

  async retry(): Promise<void> {
    if (
      this.#state.kind === "problem" &&
      this.#state.recoveries.includes("retry")
    ) {
      await this.#send(this.#state.request);
    }
  }

  async reloadReport(): Promise<void> {
    if (isBusy(this.#state)) {
      return;
    }
    this.#state = { kind: "reloading" };
    await this.#dependencies.refresh();
    this.#state = { kind: "idle" };
  }

  async #send(request: MoveRequest): Promise<void> {
    const { api, code, csrf, moved } = this.#dependencies;
    this.#state = { kind: "pending" };
    const result = await api.move(code, request, csrf);
    if (result.ok) {
      await moved(statusOf(request));
      if ("issue" in request) {
        this.#issueDraft = "";
      }
      this.#state = { kind: "moved", announcement: announcementFor(request) };
      return;
    }
    const failure = moveFailure(result.error, request.status);
    this.#state =
      failure.kind === "issue"
        ? { kind: "issueInvalid", message: failure.message }
        : {
            kind: "problem",
            message: failure.message,
            recoveries: failure.recoveries,
            request,
          };
  }
}
