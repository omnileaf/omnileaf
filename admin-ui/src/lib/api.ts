import {
  decodeServerError,
  decodeChanged,
  decodeIssueExport,
  decodeReportDetail,
  decodeReportList,
  decodeSession,
  type ServerError,
  type Decoder,
  type IssueExport,
  type MoveRequest,
  type ReportCode,
  type ReportDetail,
  type ReportList,
  type SessionInfo,
} from "#lib/wire.ts";
import { API_ROOT } from "#lib/paths.ts";

export type ApiError =
  | ServerError
  | { readonly kind: "timeout" }
  | { readonly kind: "networkFailure" }
  | { readonly kind: "unexpectedReply" };

export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApiError };

export interface ApiDependencies {
  readonly fetch: typeof globalThis.fetch;
  readonly onSignedOut: () => void;
  readonly timeoutMs?: number;
}

export interface Api {
  session(): Promise<ApiResult<SessionInfo>>;
  reports(): Promise<ApiResult<ReportList>>;
  report(code: ReportCode): Promise<ApiResult<ReportDetail>>;
  issue(code: ReportCode): Promise<ApiResult<IssueExport>>;
  move(
    code: ReportCode,
    request: MoveRequest,
    csrf: string,
  ): Promise<ApiResult<null>>;
  logout(csrf: string): Promise<ApiResult<null>>;
}

const CSRF_HEADER = "X-CSRF-Token";
const REQUEST_TIMEOUT_MS = 15_000;

const UNAUTHORIZED = 401;
const NO_CONTENT = 204;
const GATEWAY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

function failure(error: ApiError): ApiResult<never> {
  return { ok: false, error };
}

function errorFromStatus(status: number): ApiError {
  if (status === UNAUTHORIZED) {
    return { kind: "signedOut" };
  }
  return GATEWAY_STATUSES.has(status)
    ? { kind: "relayUnavailable" }
    : { kind: "unexpectedReply" };
}

function reportPath(code: ReportCode, tail = ""): string {
  return `/reports/${code}${tail}`;
}

function post(body: unknown, csrf: string): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", [CSRF_HEADER]: csrf },
    body: JSON.stringify(body),
  };
}

export function createApi(dependencies: ApiDependencies): Api {
  const timeoutMs = dependencies.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function call<T>(
    path: string,
    init: RequestInit,
    decode: (body: unknown, response: Response) => T | undefined,
  ): Promise<ApiResult<T>> {
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await dependencies.fetch(`${API_ROOT}${path}`, {
        ...init,
        signal,
      });
    } catch {
      return failure({ kind: signal.aborted ? "timeout" : "networkFailure" });
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (signal.aborted) {
        return failure({ kind: "timeout" });
      }
    }
    if (response.ok) {
      const value = decode(body, response);
      return value === undefined
        ? failure({ kind: "unexpectedReply" })
        : { ok: true, value };
    }
    const error = decodeServerError(body) ?? errorFromStatus(response.status);
    if (error.kind === "signedOut") {
      dependencies.onSignedOut();
    }
    return failure(error);
  }

  const get = <T>(path: string, decode: Decoder<T>): Promise<ApiResult<T>> =>
    call(path, { method: "GET" }, decode);

  return {
    session: () => get("/session", decodeSession),
    reports: () => get("/reports", decodeReportList),
    report: (code) => get(reportPath(code), decodeReportDetail),
    issue: (code) => get(reportPath(code, "/issue"), decodeIssueExport),
    move: (code, request, csrf) =>
      call(reportPath(code, "/status"), post(request, csrf), decodeChanged),
    logout: (csrf) =>
      call("/logout", post({}, csrf), (_body, response) =>
        response.status === NO_CONTENT ? null : undefined,
      ),
  };
}
