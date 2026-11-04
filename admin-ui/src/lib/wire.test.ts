import { expect, test } from "vitest";

import {
  decodeChanged,
  decodeIssueExport,
  decodeReportDetail,
  decodeReportList,
  decodeServerError,
  decodeSession,
  isReportCode,
} from "#lib/wire.ts";
import { fixtureText } from "#lib/testing.ts";

function fixture(name: string): unknown {
  return JSON.parse(fixtureText(name));
}

const RECEIVED = { kind: "received" };

function listedWith(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    code: "R-1111-1111",
    receivedAt: 1,
    status: RECEIVED,
    platform: "linux",
    version: "1.0.0",
    ...overrides,
  };
}

function listWith(overrides: Record<string, unknown>): unknown {
  return { reports: [listedWith(overrides)], truncated: false };
}

const AUDIT_ENTRY = {
  previous: "received",
  status: { kind: "reviewing" },
  actor: "bob",
  at: 1,
};

function detailWith(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    listed: listedWith({}),
    report: "text",
    audit: [AUDIT_ENTRY],
    ...overrides,
  };
}

test("decodes the report list fixture", () => {
  const list = decodeReportList(fixture("reports.json"));

  expect(list?.truncated).toBe(false);
  expect(list?.reports.map((report) => report.code)).toEqual([
    "R-2222-2222",
    "R-3333-3333",
    "R-1111-1111",
  ]);
  expect(list?.reports[0]).toEqual({
    code: "R-2222-2222",
    receivedAt: 1700000300,
    status: { kind: "published", issue: 42 },
    platform: "linux",
    version: "1.3.0",
  });
  expect(list?.reports[1]?.status).toEqual({ kind: "received" });
});

test("decodes a report with its text and audit trail", () => {
  const detail = decodeReportDetail(fixture("report.json"));

  expect(detail?.report).toBe("Full text of R-2222-2222");
  expect(detail?.audit).toEqual([
    {
      previous: "reviewing",
      status: { kind: "published", issue: 42 },
      actor: "alice",
      at: 1700000350,
    },
    {
      previous: "received",
      status: { kind: "reviewing" },
      actor: "bob",
      at: 1700000320,
    },
  ]);
});

test("drops a reply address the relay should never have sent", () => {
  const detail = decodeReportDetail({
    ...detailWith({}),
    replyAddress: "someone@example.com",
  });

  expect(detail).toEqual({
    listed: {
      code: "R-1111-1111",
      receivedAt: 1,
      status: { kind: "received" },
      platform: "linux",
      version: "1.0.0",
    },
    report: "text",
    audit: [AUDIT_ENTRY],
  });
});

test("tolerates a field it does not know on a listed report", () => {
  const list = decodeReportList(listWith({ screenSize: "small" }));

  expect(list?.reports).toEqual([
    {
      code: "R-1111-1111",
      receivedAt: 1,
      status: { kind: "received" },
      platform: "linux",
      version: "1.0.0",
    },
  ]);
});

test("decodes a report whose text was purged", () => {
  const detail = decodeReportDetail(fixture("report-purged.json"));

  expect(detail?.report).toBeNull();
  expect(detail?.audit).toHaveLength(2);
});

test("decodes the issue text of a report and of a purged one", () => {
  expect(decodeIssueExport(fixture("issue.json"))).toEqual({
    result: "ready",
    body: "**Report R-2222-2222**\n\nFull text of R-2222-2222",
  });
  expect(decodeIssueExport(fixture("issue-purged.json"))).toEqual({
    result: "purged",
  });
});

test("decodes the signed-in login and csrf token", () => {
  expect(decodeSession({ login: "alice", csrf: "abc" })).toEqual({
    login: "alice",
    csrf: "abc",
  });
});

test("decodes a confirmed move", () => {
  expect(decodeChanged({ result: "changed" })).toBeNull();
});

test.each([
  ["a published status without its issue", { kind: "published" }],
  ["a duplicate status without its issue", { kind: "duplicate" }],
  ["an issue of null", { kind: "published", issue: null }],
  ["an issue of zero", { kind: "published", issue: 0 }],
  ["a negative issue", { kind: "published", issue: -3 }],
  ["a fractional issue", { kind: "duplicate", issue: 4.5 }],
  ["an issue written as text", { kind: "published", issue: "42" }],
  ["a received status carrying an issue", { kind: "received", issue: 42 }],
  ["a reviewing status carrying an issue", { kind: "reviewing", issue: 42 }],
  ["a closed status carrying an issue", { kind: "closed", issue: 42 }],
  ["a status kind the dashboard does not know", { kind: "lost" }],
  ["a status that is not an object", "received"],
])("rejects a list with %s", (_name, status) => {
  expect(decodeReportList(listWith({ status }))).toBeUndefined();
});

test("keeps the issue on the kinds that carry one", () => {
  const list = decodeReportList(
    listWith({ status: { kind: "duplicate", issue: 7 } }),
  );

  expect(list?.reports[0]?.status).toEqual({ kind: "duplicate", issue: 7 });
});

test.each([
  ["a list that is not an object", []],
  ["a list without its reports", { truncated: false }],
  ["reports that are not an array", { reports: {}, truncated: false }],
  ["a list without its truncated flag", { reports: [] }],
  ["a report without a version", listWith({ version: undefined })],
  ["a negative received time", listWith({ receivedAt: -1 })],
  ["a code that is not a report code", listWith({ code: "../etc" })],
])("rejects %s", (_name, value) => {
  expect(decodeReportList(value)).toBeUndefined();
});

test.each([
  [
    "an audit entry with an unknown previous status",
    { ...AUDIT_ENTRY, previous: "lost" },
  ],
  ["an audit entry without an actor", { ...AUDIT_ENTRY, actor: undefined }],
  ["an audit entry with a text time", { ...AUDIT_ENTRY, at: "1" }],
  [
    "an audit entry with a published status but no issue",
    { ...AUDIT_ENTRY, status: { kind: "published" } },
  ],
  ["an audit entry that is not an object", "bob"],
])("rejects a report with %s", (_name, entry) => {
  expect(
    decodeReportDetail(detailWith({ audit: [AUDIT_ENTRY, entry] })),
  ).toBeUndefined();
});

test.each([
  ["a report text that is not a string", { report: 5 }],
  ["a report text that is missing", { report: undefined }],
  ["an audit trail that is not an array", { audit: "none" }],
  ["a listed report that is missing", { listed: undefined }],
])("rejects a report with %s", (_name, overrides) => {
  expect(decodeReportDetail(detailWith(overrides))).toBeUndefined();
});

test.each([
  ["a ready export without its body", { result: "ready" }],
  ["a ready export with a body that is not text", { result: "ready", body: 1 }],
  ["an unknown result", { result: "gone" }],
  ["something that is not an object", null],
])("rejects an issue export with %s", (_name, value) => {
  expect(decodeIssueExport(value)).toBeUndefined();
});

test.each([
  ["a session without a csrf token", { login: "alice" }],
  ["a session without a login", { csrf: "abc" }],
  ["a session with a login that is not text", { login: 1, csrf: "abc" }],
  ["something that is not an object", "alice"],
])("rejects %s", (_name, value) => {
  expect(decodeSession(value)).toBeUndefined();
});

test.each([
  ["another result", { result: "refused" }],
  ["no result", {}],
  ["something that is not an object", "changed"],
])("rejects a move answer with %s", (_name, value) => {
  expect(decodeChanged(value)).toBeUndefined();
});

test.each([
  "signedOut",
  "csrfRejected",
  "notFound",
  "methodNotAllowed",
  "badRequest",
  "issueRequired",
  "relayUnavailable",
])("decodes the %s error", (kind) => {
  expect(decodeServerError({ error: kind })).toEqual({ kind });
});

test("decodes a refused move with the status the report has", () => {
  expect(decodeServerError({ error: "refused", from: "closed" })).toEqual({
    kind: "refused",
    from: "closed",
  });
});

test.each([
  ["a refused move without from", { error: "refused" }],
  ["a refused move from an unknown status", { error: "refused", from: "lost" }],
  ["an error the client does not know", { error: "boom" }],
  ["a body without an error", {}],
  ["something that is not an object", "notFound"],
])("rejects %s", (_name, value) => {
  expect(decodeServerError(value)).toBeUndefined();
});

test.each([
  ["R-2222-2222", true],
  ["R-0ABC-XYZ9", true],
  ["R-2222-222", false],
  ["r-2222-2222", false],
  ["R-2222-222I", false],
  ["R-2222-2222/../x", false],
  ["", false],
])("checks whether %s is a report code", (candidate, valid) => {
  expect(isReportCode(candidate)).toBe(valid);
});

const LAST_FORMATTABLE_SECOND = 253_402_300_799;

test.each([0, 1_740_828_300, LAST_FORMATTABLE_SECOND])(
  "accepts %i seconds as the moment a report was received",
  (receivedAt) => {
    expect(decodeReportList(listWith({ receivedAt }))?.reports).toHaveLength(1);
  },
);

test.each([LAST_FORMATTABLE_SECOND + 1, Number.MAX_SAFE_INTEGER])(
  "refuses %i seconds as the moment a report was received",
  (receivedAt) => {
    expect(decodeReportList(listWith({ receivedAt }))).toBeUndefined();
  },
);

test.each([LAST_FORMATTABLE_SECOND + 1, Number.MAX_SAFE_INTEGER])(
  "refuses %i seconds as the moment of an audit entry",
  (at) => {
    const detail = detailWith({ audit: [{ ...AUDIT_ENTRY, at }] });

    expect(decodeReportDetail(detail)).toBeUndefined();
  },
);

test("accepts the last second a calendar date can show for an audit entry", () => {
  const detail = detailWith({
    audit: [{ ...AUDIT_ENTRY, at: LAST_FORMATTABLE_SECOND }],
  });

  expect(decodeReportDetail(detail)?.audit).toHaveLength(1);
});
