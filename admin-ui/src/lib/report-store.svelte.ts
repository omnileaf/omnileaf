import type { Api, ApiResult } from "#lib/api.ts";
import { describeError } from "#lib/error-copy.ts";
import {
  isReportCode,
  type ReportCode,
  type ReportDetail,
  type Status,
} from "#lib/wire.ts";

export type ReportState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly detail: ReportDetail }
  | { readonly kind: "notFound" }
  | { readonly kind: "failed"; readonly message: string };

function settled(result: ApiResult<ReportDetail>): ReportState {
  if (result.ok) {
    return { kind: "ready", detail: result.value };
  }
  return result.error.kind === "notFound"
    ? { kind: "notFound" }
    : { kind: "failed", message: describeError(result.error) };
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

  async refresh(): Promise<void> {
    const result = await this.#fetch();
    if (result !== undefined) {
      this.state = settled(result);
    }
  }

  async refreshQuietly(): Promise<void> {
    const result = await this.#fetch();
    if (result?.ok === true) {
      this.state = { kind: "ready", detail: result.value };
    }
  }

  async reload(): Promise<void> {
    if (this.#code === undefined) {
      return;
    }
    this.state = { kind: "loading" };
    await this.refresh();
  }

  applyStatus(status: Status): void {
    if (this.state.kind !== "ready") {
      return;
    }
    const { detail } = this.state;
    this.state = {
      kind: "ready",
      detail: { ...detail, listed: { ...detail.listed, status } },
    };
  }

  async #fetch(): Promise<ApiResult<ReportDetail> | undefined> {
    if (this.#code === undefined) {
      return undefined;
    }
    this.#latest += 1;
    const mine = this.#latest;
    const result = await this.#api.report(this.#code);
    return mine === this.#latest ? result : undefined;
  }
}
