import { expect, test } from "vitest";

import type { ApiResult } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";
import { ReportStore } from "#lib/report-store.svelte.ts";
import { aCode, fixtureText } from "#lib/testing.ts";
import { decodeReportDetail, type ReportDetail } from "#lib/wire.ts";

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
