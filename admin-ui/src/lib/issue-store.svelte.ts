import type { Api, ApiResult } from "#lib/api.ts";
import { describeError } from "#lib/error-copy.ts";
import { isReportCode, type IssueExport, type ReportCode } from "#lib/wire.ts";

export type IssueState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly body: string }
  | { readonly kind: "purged" }
  | { readonly kind: "notFound" }
  | { readonly kind: "failed"; readonly message: string };

function settled(result: ApiResult<IssueExport>): IssueState {
  if (result.ok) {
    return result.value.result === "ready"
      ? { kind: "ready", body: result.value.body }
      : { kind: "purged" };
  }
  return result.error.kind === "notFound"
    ? { kind: "notFound" }
    : { kind: "failed", message: describeError(result.error) };
}

export class IssueStore {
  state: IssueState;

  readonly #api: Pick<Api, "issue">;
  readonly #code: ReportCode | undefined;
  #latest = 0;

  constructor(api: Pick<Api, "issue">, code: string) {
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
    const result = await this.#api.issue(this.#code);
    if (mine === this.#latest) {
      this.state = settled(result);
    }
  }
}
