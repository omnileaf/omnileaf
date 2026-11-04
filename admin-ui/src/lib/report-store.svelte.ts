import type { Api, ApiError } from "#lib/api.ts";
import { describeError } from "#lib/error-copy.ts";
import { isReportCode, type ReportCode, type ReportDetail } from "#lib/wire.ts";

export type ReportState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly detail: ReportDetail }
  | { readonly kind: "notFound" }
  | { readonly kind: "failed"; readonly message: string };

function failure(error: ApiError): ReportState {
  return error.kind === "notFound"
    ? { kind: "notFound" }
    : { kind: "failed", message: describeError(error) };
}

export class ReportStore {
  state: ReportState;

  readonly #api: Pick<Api, "report">;
  readonly #code: ReportCode | undefined;
  #latest = 0;

  constructor(api: Pick<Api, "report">, code: string) {
    this.#api = api;
    this.#code = isReportCode(code) ? code : undefined;
    this.state = $state.raw(
      this.#code === undefined ? { kind: "notFound" } : { kind: "loading" },
    );
  }

  async reload(): Promise<void> {
    if (this.#code === undefined) {
      return;
    }
    this.#latest += 1;
    const mine = this.#latest;
    this.state = { kind: "loading" };
    const result = await this.#api.report(this.#code);
    if (mine !== this.#latest) {
      return;
    }
    this.state = result.ok
      ? { kind: "ready", detail: result.value }
      : failure(result.error);
  }
}
