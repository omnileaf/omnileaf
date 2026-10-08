import type { IpcError } from "#lib/ipc/bindings.ts";

export type CopyDetails = () => Promise<
  { status: "ok"; data: null } | { status: "error"; error: IpcError }
>;

export type CopyOutcome = "idle" | "copied" | "failed";

export const COPIED_FOR_MS = 2000;

/** Copies details to the clipboard through the backend and says so for a moment, or says why it couldn't. */
export class DetailsCopying {
  outcome: CopyOutcome = $state("idle");

  #settle: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly copyDetails: CopyDetails) {}

  async copy(): Promise<void> {
    clearTimeout(this.#settle);
    if (this.outcome === "failed") {
      this.outcome = "idle";
    }
    const result = await this.copyDetails();
    if (result.status === "error") {
      this.outcome = "failed";
      return;
    }
    this.outcome = "copied";
    this.#settle = setTimeout(() => {
      this.outcome = "idle";
    }, COPIED_FOR_MS);
  }
}
