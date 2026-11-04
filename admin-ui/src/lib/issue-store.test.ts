import { expect, test } from "vitest";

import type { ApiResult } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";
import { IssueStore } from "#lib/issue-store.svelte.ts";
import { aCode, fixtureText } from "#lib/testing.ts";
import { decodeIssueExport, type IssueExport } from "#lib/wire.ts";

const CODE = aCode("R-2222-2222");

function fixture(name: string): IssueExport {
  const decoded = decodeIssueExport(JSON.parse(fixtureText(name)));
  if (decoded === undefined) {
    throw new Error(`${name} is not an issue export`);
  }
  return decoded;
}

const READY = fixture("issue.json");
const PURGED = fixture("issue-purged.json");

function ok(value: IssueExport): ApiResult<IssueExport> {
  return { ok: true, value };
}

function fakeApi(...replies: Promise<ApiResult<IssueExport>>[]) {
  const asked: string[] = [];
  return {
    api: {
      issue: (code: string) => {
        const reply = replies[asked.length];
        asked.push(code);
        return reply ?? Promise.reject(new Error("no reply queued"));
      },
    },
    asked,
  };
}

function deferred() {
  let settle: (result: ApiResult<IssueExport>) => void = () => undefined;
  const promise = new Promise<ApiResult<IssueExport>>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

test("starts out loading without asking the api", () => {
  const { api, asked } = fakeApi();

  const store = new IssueStore(api, CODE);

  expect(store.state).toEqual({ kind: "loading" });
  expect(asked).toEqual([]);
});

test("holds the issue text once it arrives", async () => {
  const { api, asked } = fakeApi(Promise.resolve(ok(READY)));
  const store = new IssueStore(api, CODE);

  await store.reload();

  expect(store.state).toEqual({
    kind: "ready",
    body: "**Report R-2222-2222**\n\nFull text of R-2222-2222",
  });
  expect(asked).toEqual([CODE]);
});

test("says the text was purged when the service no longer holds it", async () => {
  const { api } = fakeApi(Promise.resolve(ok(PURGED)));
  const store = new IssueStore(api, CODE);

  await store.reload();

  expect(store.state).toEqual({ kind: "purged" });
});

test("says the report does not exist when the service has no such code", async () => {
  const { api } = fakeApi(
    Promise.resolve({ ok: false, error: { kind: "notFound" } }),
  );
  const store = new IssueStore(api, CODE);

  await store.reload();

  expect(store.state).toEqual({ kind: "notFound" });
});

test("treats a code that is not a report code as missing without asking the api", async () => {
  const { api, asked } = fakeApi();
  const store = new IssueStore(api, "not-a-code");

  expect(store.state).toEqual({ kind: "notFound" });
  await store.reload();

  expect(store.state).toEqual({ kind: "notFound" });
  expect(asked).toEqual([]);
});

test("says what went wrong when the reports service does not answer", async () => {
  const { api } = fakeApi(
    Promise.resolve({ ok: false, error: { kind: "relayUnavailable" } }),
  );
  const store = new IssueStore(api, CODE);

  await store.reload();

  expect(store.state).toEqual({
    kind: "failed",
    message: copy.errors.relayUnavailable,
  });
});

test("shows loading again while a retry is in flight and then the text", async () => {
  const second = deferred();
  const { api } = fakeApi(
    Promise.resolve({ ok: false, error: { kind: "timeout" } }),
    second.promise,
  );
  const store = new IssueStore(api, CODE);
  await store.reload();

  const retrying = store.reload();
  expect(store.state).toEqual({ kind: "loading" });
  second.settle(ok(READY));
  await retrying;

  expect(store.state.kind).toBe("ready");
});

test("ignores an older answer that arrives after a newer reload", async () => {
  const first = deferred();
  const second = deferred();
  const { api } = fakeApi(first.promise, second.promise);
  const store = new IssueStore(api, CODE);

  const slow = store.reload();
  const fast = store.reload();
  second.settle(ok(PURGED));
  await fast;
  first.settle(ok(READY));
  await slow;

  expect(store.state).toEqual({ kind: "purged" });
});
