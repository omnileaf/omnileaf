import { expect, test } from "vitest";

import type { ApiResult } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";
import { ReportsStore } from "#lib/reports-store.svelte.ts";
import { aCode, aListed } from "#lib/testing.ts";
import type { ReportList } from "#lib/wire.ts";

const LISTED = aListed();
const OLDER = aListed({ receivedAt: 5 });

function ok(list: ReportList): ApiResult<ReportList> {
  return { ok: true, value: list };
}

function fakeApi(...replies: Promise<ApiResult<ReportList>>[]) {
  let calls = 0;
  return {
    api: {
      reports: () => {
        const reply = replies[calls];
        calls += 1;
        return reply ?? Promise.reject(new Error("no reply queued"));
      },
    },
    calls: () => calls,
  };
}

function deferred() {
  let settle: (result: ApiResult<ReportList>) => void = () => undefined;
  const promise = new Promise<ApiResult<ReportList>>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

test("starts out loading without asking the api", () => {
  const { api, calls } = fakeApi();

  const store = new ReportsStore(api);

  expect(store.state).toEqual({ kind: "loading" });
  expect(calls()).toBe(0);
});

test("holds the reports and the truncation once they arrive", async () => {
  const { api } = fakeApi(
    Promise.resolve(ok({ reports: [LISTED], truncated: true })),
  );
  const store = new ReportsStore(api);

  await store.reload();

  expect(store.state).toEqual({
    kind: "ready",
    reports: [LISTED],
    truncated: true,
  });
});

test("loads once however often the screens ask", async () => {
  const { api, calls } = fakeApi(
    Promise.resolve(ok({ reports: [LISTED], truncated: false })),
  );
  const store = new ReportsStore(api);

  await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
  await store.ensureLoaded();

  expect(calls()).toBe(1);
  expect(store.state.kind).toBe("ready");
});

test("says what went wrong when the relay does not answer", async () => {
  const { api } = fakeApi(
    Promise.resolve({ ok: false, error: { kind: "relayUnavailable" } }),
  );
  const store = new ReportsStore(api);

  await store.reload();

  expect(store.state).toEqual({
    kind: "failed",
    message: copy.errors.relayUnavailable,
  });
});

test("shows loading again while a reload is in flight and then the new reports", async () => {
  const second = deferred();
  const { api } = fakeApi(
    Promise.resolve({ ok: false, error: { kind: "timeout" } }),
    second.promise,
  );
  const store = new ReportsStore(api);
  await store.reload();

  const reloading = store.reload();
  expect(store.state).toEqual({ kind: "loading" });
  second.settle(ok({ reports: [OLDER], truncated: false }));
  await reloading;

  expect(store.state).toEqual({
    kind: "ready",
    reports: [OLDER],
    truncated: false,
  });
});

test("ignores an older answer that arrives after a newer reload", async () => {
  const first = deferred();
  const second = deferred();
  const { api } = fakeApi(first.promise, second.promise);
  const store = new ReportsStore(api);

  const slow = store.reload();
  const fast = store.reload();
  second.settle(ok({ reports: [OLDER], truncated: false }));
  await fast;
  first.settle(ok({ reports: [LISTED], truncated: true }));
  await slow;

  expect(store.state).toEqual({
    kind: "ready",
    reports: [OLDER],
    truncated: false,
  });
});

const MOVED = aListed({ status: { kind: "closed" } });

test("replaces the entry of a report that changed without moving it in the list", async () => {
  const other = aListed({ code: aCode("R-3333-3333"), receivedAt: 99 });
  const { api } = fakeApi(
    Promise.resolve(ok({ reports: [other, LISTED], truncated: true })),
  );
  const store = new ReportsStore(api);
  await store.reload();

  store.apply(MOVED);

  expect(store.state).toEqual({
    kind: "ready",
    reports: [other, MOVED],
    truncated: true,
  });
});

test("leaves the list alone when the report is not in it", async () => {
  const other = aListed({ code: aCode("R-3333-3333") });
  const { api } = fakeApi(
    Promise.resolve(ok({ reports: [other], truncated: false })),
  );
  const store = new ReportsStore(api);
  await store.reload();

  store.apply(MOVED);

  expect(store.state).toEqual({
    kind: "ready",
    reports: [other],
    truncated: false,
  });
});

test("leaves a list that is still loading alone", () => {
  const { api } = fakeApi();
  const store = new ReportsStore(api);

  store.apply(MOVED);

  expect(store.state).toEqual({ kind: "loading" });
});
