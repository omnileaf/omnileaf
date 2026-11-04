export const STATUS_KINDS = [
  "received",
  "reviewing",
  "published",
  "duplicate",
  "closed",
] as const;

export const LIST_LIMIT = 500;

export const ISSUE_STATUS_KINDS = ["published", "duplicate"] as const;

export const SERVER_ERROR_KINDS = [
  "signedOut",
  "csrfRejected",
  "notFound",
  "methodNotAllowed",
  "badRequest",
  "issueRequired",
  "relayUnavailable",
] as const;

export type StatusKind = (typeof STATUS_KINDS)[number];
export type IssueStatusKind = (typeof ISSUE_STATUS_KINDS)[number];
export type MoveTarget = Exclude<StatusKind, "received">;

export type Status =
  | { readonly kind: Exclude<StatusKind, IssueStatusKind> }
  | { readonly kind: IssueStatusKind; readonly issue: number };

export type ReportCode = string & { readonly __brand: "ReportCode" };

export interface Listed {
  readonly code: ReportCode;
  readonly receivedAt: number;
  readonly status: Status;
  readonly platform: string;
  readonly version: string;
}

export interface AuditEntry {
  readonly previous: StatusKind;
  readonly status: Status;
  readonly actor: string;
  readonly at: number;
}

export interface SessionInfo {
  readonly login: string;
  readonly csrf: string;
}

export interface ReportList {
  readonly reports: readonly Listed[];
  readonly truncated: boolean;
}

export interface ReportDetail {
  readonly listed: Listed;
  readonly report: string | null;
  readonly audit: readonly AuditEntry[];
}

export type IssueExport =
  | { readonly result: "ready"; readonly body: string }
  | { readonly result: "purged" };

export type MoveRequest =
  | { readonly status: Exclude<MoveTarget, IssueStatusKind> }
  | { readonly status: IssueStatusKind; readonly issue: number };

export type ServerError =
  | { readonly kind: (typeof SERVER_ERROR_KINDS)[number] }
  | { readonly kind: "refused"; readonly from: StatusKind };

export type Decoder<T> = (value: unknown) => T | undefined;

const REPORT_CODE = /^R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export function isReportCode(candidate: string): candidate is ReportCode {
  return REPORT_CODE.test(candidate);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIssueStatusKind(kind: StatusKind): kind is IssueStatusKind {
  return ISSUE_STATUS_KINDS.some((issueKind) => issueKind === kind);
}

const text: Decoder<string> = (value) =>
  typeof value === "string" ? value : undefined;

const count: Decoder<number> = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const LAST_FORMATTABLE_SECOND = 253_402_300_799;

const unixSeconds: Decoder<number> = (value) => {
  const seconds = count(value);
  return seconds !== undefined && seconds <= LAST_FORMATTABLE_SECOND
    ? seconds
    : undefined;
};

const issueNumber: Decoder<number> = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;

const flag: Decoder<boolean> = (value) =>
  typeof value === "boolean" ? value : undefined;

const statusKind: Decoder<StatusKind> = (value) =>
  STATUS_KINDS.find((kind) => kind === value);

const code: Decoder<ReportCode> = (value) =>
  typeof value === "string" && isReportCode(value) ? value : undefined;

function listOf<T>(decode: Decoder<T>): Decoder<readonly T[]> {
  return (value) => {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const items = value.map((item: unknown) => decode(item));
    return items.every((item): item is T => item !== undefined)
      ? items
      : undefined;
  };
}

const status: Decoder<Status> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = statusKind(value["kind"]);
  if (kind === undefined) {
    return undefined;
  }
  if (isIssueStatusKind(kind)) {
    const issue = issueNumber(value["issue"]);
    return issue === undefined ? undefined : { kind, issue };
  }
  return value["issue"] === undefined ? { kind } : undefined;
};

const listed: Decoder<Listed> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = code(value["code"]);
  const receivedAt = unixSeconds(value["receivedAt"]);
  const state = status(value["status"]);
  const platform = text(value["platform"]);
  const version = text(value["version"]);
  return id === undefined ||
    receivedAt === undefined ||
    state === undefined ||
    platform === undefined ||
    version === undefined
    ? undefined
    : { code: id, receivedAt, status: state, platform, version };
};

const auditEntry: Decoder<AuditEntry> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const previous = statusKind(value["previous"]);
  const state = status(value["status"]);
  const actor = text(value["actor"]);
  const at = unixSeconds(value["at"]);
  return previous === undefined ||
    state === undefined ||
    actor === undefined ||
    at === undefined
    ? undefined
    : { previous, status: state, actor, at };
};

export const decodeSession: Decoder<SessionInfo> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const login = text(value["login"]);
  const csrf = text(value["csrf"]);
  return login === undefined || csrf === undefined
    ? undefined
    : { login, csrf };
};

export const decodeReportList: Decoder<ReportList> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const reports = listOf(listed)(value["reports"]);
  const truncated = flag(value["truncated"]);
  return reports === undefined || truncated === undefined
    ? undefined
    : { reports, truncated };
};

export const decodeReportDetail: Decoder<ReportDetail> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const summary = listed(value["listed"]);
  const audit = listOf(auditEntry)(value["audit"]);
  const body = value["report"];
  const report = body === null ? null : text(body);
  return summary === undefined || audit === undefined || report === undefined
    ? undefined
    : { listed: summary, report, audit };
};

export const decodeIssueExport: Decoder<IssueExport> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value["result"] === "purged") {
    return { result: "purged" };
  }
  const body = text(value["body"]);
  return value["result"] === "ready" && body !== undefined
    ? { result: "ready", body }
    : undefined;
};

export const decodeChanged: Decoder<null> = (value) =>
  isRecord(value) && value["result"] === "changed" ? null : undefined;

export const decodeServerError: Decoder<ServerError> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const simple = SERVER_ERROR_KINDS.find((kind) => kind === value["error"]);
  if (simple !== undefined) {
    return { kind: simple };
  }
  const from = statusKind(value["from"]);
  return value["error"] === "refused" && from !== undefined
    ? { kind: "refused", from }
    : undefined;
};
