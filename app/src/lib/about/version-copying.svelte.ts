import type { commands } from "$lib/ipc/bindings";

export type CopyVersionDetails = typeof commands.copyVersionDetails;

export type CopyOutcome = "idle" | "copied" | "failed";

export const COPIED_FOR_MS = 2000;

/** Copies the version details and says so for a moment, or says why it couldn't. */
export class VersionCopying {
  outcome: CopyOutcome = $state("idle");

  #settle: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly copyDetails: CopyVersionDetails) {}

  async copy(): Promise<void> {
    clearTimeout(this.#settle);
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
