import { createContext } from "svelte";

import type { Api } from "#lib/api.ts";
import { describeError } from "#lib/error-copy.ts";
import type { Listed } from "#lib/wire.ts";

export type ReportsState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly reports: readonly Listed[];
      readonly truncated: boolean;
    }
  | { readonly kind: "failed"; readonly message: string };

export class ReportsStore {
  state: ReportsState = $state.raw({ kind: "loading" });

  readonly #api: Pick<Api, "reports">;
  #firstLoad: Promise<void> | undefined;
  #latest = 0;

  constructor(api: Pick<Api, "reports">) {
    this.#api = api;
  }

  ensureLoaded(): Promise<void> {
    this.#firstLoad ??= this.reload();
    return this.#firstLoad;
  }

  apply(report: Listed): void {
    if (this.state.kind !== "ready") {
      return;
    }
    this.state = {
      ...this.state,
      reports: this.state.reports.map((listed) =>
        listed.code === report.code ? report : listed,
      ),
    };
  }

  async reload(): Promise<void> {
    this.#latest += 1;
    const mine = this.#latest;
    this.state = { kind: "loading" };
    const result = await this.#api.reports();
    if (mine !== this.#latest) {
      return;
    }
    this.state = result.ok
      ? { kind: "ready", ...result.value }
      : { kind: "failed", message: describeError(result.error) };
  }
}

export const [useReports, provideReports] = createContext<ReportsStore>();
