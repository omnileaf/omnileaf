import { expect, test } from "vitest";

import { loadWhenSignedIn } from "#lib/load-reports.ts";
import { ReportsStore } from "#lib/reports-store.svelte.ts";
import type { ApiResult } from "#lib/api.ts";
import type { ReportList } from "#lib/wire.ts";

const SIGNED_IN = { ok: true } as const;
const SIGNED_OUT = { ok: false } as const;

function storeWithCounter() {
  let calls = 0;
  const store = new ReportsStore({
    reports: (): Promise<ApiResult<ReportList>> => {
      calls += 1;
      return Promise.resolve({
        ok: true,
        value: { reports: [], truncated: false },
      });
    },
  });
  return { store, calls: () => calls };
}

test("leaves the reports alone while the session has failed", () => {
  const { store, calls } = storeWithCounter();

  loadWhenSignedIn(SIGNED_OUT, store);

  expect(calls()).toBe(0);
  expect(store.state).toEqual({ kind: "loading" });
});

test("loads the reports once the session opens after a failed first try", async () => {
  const { store, calls } = storeWithCounter();

  loadWhenSignedIn(SIGNED_OUT, store);
  loadWhenSignedIn(SIGNED_IN, store);
  await store.ensureLoaded();

  expect(calls()).toBe(1);
  expect(store.state.kind).toBe("ready");
});

test("loads only once however often the signed in session is seen", async () => {
  const { store, calls } = storeWithCounter();

  loadWhenSignedIn(SIGNED_IN, store);
  loadWhenSignedIn(SIGNED_IN, store);
  await store.ensureLoaded();
  loadWhenSignedIn(SIGNED_IN, store);

  expect(calls()).toBe(1);
});
