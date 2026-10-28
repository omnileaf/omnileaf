import type {
  DropMode,
  DropOutcome,
  DropSummary,
  RefusedDrop,
} from "#lib/ipc/bindings.ts";

import type { DropTarget } from "./drop-target-at.ts";
import type { Point, WindowDrag } from "./window-drag.ts";

export type DropState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "offering";
      readonly summary: DropSummary;
      readonly over: DropTarget | null;
      readonly copies: boolean;
    }
  | { readonly kind: "refused"; readonly refused: readonly RefusedDrop[] };

export interface DropPorts {
  inspect(paths: string[]): Promise<DropSummary>;
  drop(paths: string[], mode: DropMode): Promise<DropOutcome>;
  targetAt(at: Point): DropTarget | null;
  onDropped(outcome: DropOutcome, mode: DropMode): void;
  onFailed(error: unknown): void;
}

export class FileDrop {
  state: DropState = $state({ kind: "idle" });

  readonly #ports: DropPorts;
  #generation = 0;
  #inspection: Promise<void> = Promise.resolve();
  #summary: DropSummary | null = null;
  #over: DropTarget | null = null;
  #copies = false;

  constructor(ports: DropPorts) {
    this.#ports = ports;
  }

  handle(drag: WindowDrag): Promise<void> {
    switch (drag.kind) {
      case "enter":
        return this.#enter(drag.paths, drag.at);
      case "over":
        this.#follow(drag.at);
        return Promise.resolve();
      case "drop":
        return this.#dropped(drag.paths, drag.at);
      case "leave":
        this.#leave();
        return Promise.resolve();
    }
  }

  setAltHeld(isHeld: boolean): void {
    this.#copies = isHeld;
    this.#show();
  }

  #enter(paths: string[], at: Point): Promise<void> {
    this.#generation += 1;
    const generation = this.#generation;
    this.#reset();
    this.#inspection = this.#ports.inspect(paths).then(
      (summary) => {
        if (generation === this.#generation) {
          this.#summary = summary;
          this.#over = this.#ports.targetAt(at);
          this.#show();
        }
      },
      (error: unknown) => {
        if (generation === this.#generation) {
          this.#ports.onFailed(error);
        }
      },
    );
    return this.#inspection;
  }

  #follow(at: Point): void {
    this.#over = this.#ports.targetAt(at);
    this.#show();
  }

  async #dropped(paths: string[], at: Point): Promise<void> {
    await this.#inspection;
    const target =
      this.#summary?.first == null ? null : this.#ports.targetAt(at);
    const mode = this.#modeFor(target);
    this.#generation += 1;
    this.#reset();
    if (mode === null) {
      return;
    }
    try {
      this.#ports.onDropped(await this.#ports.drop(paths, mode), mode);
    } catch (error) {
      this.#ports.onFailed(error);
    }
  }

  #modeFor(target: DropTarget | null): DropMode | null {
    switch (target) {
      case "readNow":
        return "readNow";
      case "add":
        return this.#copies ? "copy" : "add";
      case null:
        return null;
    }
  }

  #leave(): void {
    this.#generation += 1;
    this.#reset();
  }

  #reset(): void {
    this.#summary = null;
    this.#over = null;
    this.state = { kind: "idle" };
  }

  #show(): void {
    const summary = this.#summary;
    if (summary === null) {
      return;
    }
    this.state =
      summary.first === null
        ? summary.refused.length === 0
          ? { kind: "idle" }
          : { kind: "refused", refused: summary.refused }
        : {
            kind: "offering",
            summary,
            over: this.#over,
            copies: this.#copies,
          };
  }
}
