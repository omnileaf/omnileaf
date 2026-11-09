import { expect, test } from "vitest";

import type { ApiResult } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";
import { ReportStore } from "#lib/report-store.svelte.ts";
import { aCode, fixtureText } from "#lib/testing.ts";
import {
  decodeReportDetail,
  type ReportDetail,
  type Status,
} from "#lib/wire.ts";

const CODE = aCode("R-2222-2222");

function aDetail(): ReportDetail {
  const detail: unknown = JSON.parse(fixtureText("report.json"));
  const decoded = decodeReportDetail(detail);
  if (decoded === undefined) {
    throw new Error("report.json is not a report");
  }
  return decoded;
}

const DETAIL = aDetail();

function ok(detail: ReportDetail): ApiResult<ReportDetail> {
  return { ok: true, value: detail };
}

function fakeApi(...replies: Promise<ApiResult<ReportDetail>>[]) {
  const asked: string[] = [];
  return {
    api: {
      report: (code: string) => {
        const reply = replies[asked.length];
        asked.push(code);
        return reply ?? Promise.reject(new Error("no reply queued"));
      },
    },
    asked,
  };
}

function deferred() {
  let settle: (result: ApiResult<ReportDetail>) => void = () => undefined;
  const promise = new Promise<ApiResult<ReportDetail>>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

test("starts out loading without asking the api", () => {
  const { api, asked } = fakeApi();

  const store = new ReportStore(api, CODE);

  expect(store.state).toEqual({ kind: "loading" });
  expect(asked).toEqual([]);
});

test("holds the report once it arrives", async () => {
  const { api, asked } = fakeApi(Promise.resolve(ok(DETAIL)));
  const store = new ReportStore(api, CODE);

  await store.reload();

  expect(store.state).toEqual({ kind: "ready", detail: DETAIL });
  expect(asked).toEqual([CODE]);
});

test("says the report does not exist when the service has no such code", async () => {
  const { api } = fakeApi(
    Promise.resolve({ ok: false, error: { kind: "notFound" } }),
  );
  const store = new ReportStore(api, CODE);

  await store.reload();

  expect(store.state).toEqual({ kind: "notFound" });
});

test("treats a code that is not a report code as missing without asking the api", async () => {
  const { api, asked } = fakeApi();
  const store = new ReportStore(api, "not-a-code");

  expect(store.state).toEqual({ kind: "notFound" });
  await store.reload();

  expect(store.state).toEqual({ kind: "notFound" });
  expect(asked).toEqual([]);
});

test("says what went wrong when the reports service does not answer", async () => {
  const { api } = fakeApi(
    Promise.resolve({ ok: false, error: { kind: "relayUnavailable" } }),
  );
  const store = new ReportStore(api, CODE);

  await store.reload();

  expect(store.state).toEqual({
    kind: "failed",
    message: copy.errors.relayUnavailable,
  });
});

test("shows loading again while a reload is in flight and then the report", async () => {
  const second = deferred();
  const { api } = fakeApi(
    Promise.resolve({ ok: false, error: { kind: "timeout" } }),
    second.promise,
  );
  const store = new ReportStore(api, CODE);
  await store.reload();

  const reloading = store.reload();
  expect(store.state).toEqual({ kind: "loading" });
  second.settle(ok(DETAIL));
  await reloading;

  expect(store.state).toEqual({ kind: "ready", detail: DETAIL });
});

test("ignores an older answer that arrives after a newer reload", async () => {
  const first = deferred();
  const second = deferred();
  const newer: ReportDetail = { ...DETAIL, report: null };
  const { api } = fakeApi(first.promise, second.promise);
  const store = new ReportStore(api, CODE);

  const slow = store.reload();
  const fast = store.reload();
  second.settle(ok(newer));
  await fast;
  first.settle(ok(DETAIL));
  await slow;

  expect(store.state).toEqual({ kind: "ready", detail: newer });
});

test("keeps showing the report while a refresh is in flight and then swaps it", async () => {
  const second = deferred();
  const newer: ReportDetail = { ...DETAIL, report: null };
  const { api } = fakeApi(Promise.resolve(ok(DETAIL)), second.promise);
  const store = new ReportStore(api, CODE);
  await store.reload();

  const refreshing = store.refresh();
  expect(store.state).toEqual({ kind: "ready", detail: DETAIL });
  second.settle(ok(newer));
  await refreshing;

  expect(store.state).toEqual({ kind: "ready", detail: newer });
});

test("reports a failed refresh instead of keeping stale facts", async () => {
  const { api } = fakeApi(
    Promise.resolve(ok(DETAIL)),
    Promise.resolve({ ok: false, error: { kind: "timeout" } }),
  );
  const store = new ReportStore(api, CODE);
  await store.reload();

  await store.refresh();

  expect(store.state).toEqual({
    kind: "failed",
    message: copy.errors.timeout,
  });
});

test("ignores a reload answer that arrives after a newer refresh", async () => {
  const first = deferred();
  const second = deferred();
  const newer: ReportDetail = { ...DETAIL, report: null };
  const { api } = fakeApi(first.promise, second.promise);
  const store = new ReportStore(api, CODE);

  const slow = store.reload();
  const fast = store.refresh();
  second.settle(ok(newer));
  await fast;
  first.settle(ok(DETAIL));
  await slow;

  expect(store.state).toEqual({ kind: "ready", detail: newer });
});

test("does not ask the api to refresh a code that is not a report code", async () => {
  const { api, asked } = fakeApi();
  const store = new ReportStore(api, "nope");

  await store.refresh();

  expect(asked).toEqual([]);
  expect(store.state).toEqual({ kind: "notFound" });
});

const CLOSED: Status = { kind: "closed" };

test("shows the status a move is known to have set while the rest of the report is unchanged", async () => {
  const { api } = fakeApi(Promise.resolve(ok(DETAIL)));
  const store = new ReportStore(api, CODE);
  await store.reload();

  store.applyStatus(CLOSED);

  expect(store.state).toEqual({
    kind: "ready",
    detail: { ...DETAIL, listed: { ...DETAIL.listed, status: CLOSED } },
  });
});

test("has no status to change while the report is still loading", () => {
  const store = new ReportStore(fakeApi().api, CODE);

  store.applyStatus(CLOSED);

  expect(store.state).toEqual({ kind: "loading" });
});

test("has no status to change for a report that does not exist", () => {
  const store = new ReportStore(fakeApi().api, "nope");

  store.applyStatus(CLOSED);

  expect(store.state).toEqual({ kind: "notFound" });
});

test("swaps in the refreshed report without showing it as loading", async () => {
  const second = deferred();
  const newer: ReportDetail = { ...DETAIL, report: null };
  const { api } = fakeApi(Promise.resolve(ok(DETAIL)), second.promise);
  const store = new ReportStore(api, CODE);
  await store.reload();

  const refreshing = store.refreshQuietly();
  expect(store.state).toEqual({ kind: "ready", detail: DETAIL });
  second.settle(ok(newer));
  await refreshing;

  expect(store.state).toEqual({ kind: "ready", detail: newer });
});

test.each([
  { kind: "timeout" },
  { kind: "relayUnavailable" },
  { kind: "networkFailure" },
  { kind: "notFound" },
] as const)(
  "keeps what it shows when a quiet refresh fails with $kind",
  async (error) => {
    const { api } = fakeApi(
      Promise.resolve(ok(DETAIL)),
      Promise.resolve({ ok: false, error }),
    );
    const store = new ReportStore(api, CODE);
    await store.reload();
    store.applyStatus(CLOSED);
    const shown = store.state;

    await store.refreshQuietly();

    expect(store.state).toEqual(shown);
  },
);

test("drops the answer of an earlier load when a move changes the status and refreshes", async () => {
  const first = deferred();
  const second = deferred();
  const { api } = fakeApi(
    Promise.resolve(ok(DETAIL)),
    first.promise,
    second.promise,
  );
  const store = new ReportStore(api, CODE);
  await store.reload();
  const slow = store.refresh();

  store.applyStatus(CLOSED);
  const quiet = store.refreshQuietly();
  second.settle(
    ok({ ...DETAIL, listed: { ...DETAIL.listed, status: CLOSED } }),
  );
  await quiet;
  first.settle(ok(DETAIL));
  await slow;

  expect(store.state).toMatchObject({
    kind: "ready",
    detail: { listed: { status: CLOSED } },
  });
});
