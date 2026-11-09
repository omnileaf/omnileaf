import { expect, test, vi } from "vitest";

import type { ApiError, ApiResult } from "#lib/api.ts";
import { MoveControl } from "#lib/move-control.svelte.ts";
import { aCode } from "#lib/testing.ts";
import type { MoveRequest, MoveTarget, ReportCode, Status } from "#lib/wire.ts";

const CODE = aCode("R-2222-2222");
const CSRF = "token-1";

const ISSUE_NEEDED =
  "Enter the issue number to mark this report published. Use a whole number above zero.";

const CHANGED: ApiResult<null> = { ok: true, value: null };

function failed(error: ApiError): ApiResult<null> {
  return { ok: false, error };
}

interface Call {
  readonly code: ReportCode;
  readonly request: MoveRequest;
  readonly csrf: string;
}

function deferred<T>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function choose(
  control: MoveControl,
  target: MoveTarget,
  draft: string,
): Promise<void> {
  control.changeDraft(draft);
  return control.choose(target);
}

interface Setup {
  readonly control: MoveControl;
  readonly calls: Call[];
  readonly refresh: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly moved: ReturnType<typeof vi.fn<(status: Status) => Promise<void>>>;
}

function setup(
  ...replies: (ApiResult<null> | Promise<ApiResult<null>>)[]
): Setup {
  const calls: Call[] = [];
  const refresh = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const moved = vi.fn<(status: Status) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const control = new MoveControl({
    api: {
      move: (code, request, csrf) => {
        calls.push({ code, request, csrf });
        return Promise.resolve(replies[calls.length - 1] ?? CHANGED);
      },
    },
    code: CODE,
    csrf: CSRF,
    refresh,
    moved,
  });
  return { control, calls, refresh, moved };
}

test("starts idle with an empty issue number without asking the api", () => {
  const { control, calls } = setup();

  expect(control.state).toEqual({ kind: "idle" });
  expect(control.issueDraft).toBe("");
  expect(calls).toEqual([]);
});

test("keeps what is typed in the issue number field", () => {
  const { control } = setup();

  control.changeDraft("43");
  control.changeDraft("430");

  expect(control.issueDraft).toBe("430");
});

test("moves a report straight away to a status that can be undone", async () => {
  const { control, calls, moved, refresh } = setup();

  await choose(control, "closed", "");

  expect(calls).toEqual([
    { code: CODE, request: { status: "closed" }, csrf: CSRF },
  ]);
  expect(moved).toHaveBeenCalledExactlyOnceWith({ kind: "closed" });
  expect(refresh).not.toHaveBeenCalled();
  expect(control.state).toEqual({
    kind: "moved",
    announcement: "Moved to Closed.",
  });
});

test("keeps the controls busy until the move has been reflected in the report", async () => {
  const reflected = deferred<undefined>();
  const control = new MoveControl({
    api: { move: () => Promise.resolve(CHANGED) },
    code: CODE,
    csrf: CSRF,
    refresh: () => Promise.resolve(),
    moved: () => reflected.promise,
  });

  const moving = choose(control, "reviewing", "");

  expect(control.state).toEqual({ kind: "pending" });
  reflected.settle(undefined);
  await moving;
  expect(control.state.kind).toBe("moved");
});

test("asks first before a move that cannot be undone and sends nothing yet", async () => {
  const { control, calls } = setup();

  await choose(control, "published", "430");

  expect(control.state).toEqual({
    kind: "confirming",
    request: { status: "published", issue: 430 },
  });
  expect(calls).toEqual([]);
});

test("sends the confirmed move, reflects the issue and announces it", async () => {
  const { control, calls, moved } = setup();
  await choose(control, "duplicate", "#12");

  await control.confirm();

  expect(calls).toEqual([
    {
      code: CODE,
      request: { status: "duplicate", issue: 12 },
      csrf: CSRF,
    },
  ]);
  expect(moved).toHaveBeenCalledExactlyOnceWith({
    kind: "duplicate",
    issue: 12,
  });
  expect(control.state).toEqual({
    kind: "moved",
    announcement: "Moved to Duplicate, issue #12.",
  });
});

test("goes back to the form without sending when the confirmation is cancelled", async () => {
  const { control, calls } = setup();
  await choose(control, "published", "430");

  control.cancel();

  expect(control.state).toEqual({ kind: "idle" });
  expect(calls).toEqual([]);
});

test("does not send a move nobody confirmed", async () => {
  const { control, calls } = setup();

  await control.confirm();

  expect(calls).toEqual([]);
  expect(control.state).toEqual({ kind: "idle" });
});

test("asks for the issue number instead of calling the api without one", async () => {
  const { control, calls } = setup();

  await choose(control, "published", "");

  expect(control.state).toEqual({
    kind: "issueInvalid",
    message: ISSUE_NEEDED,
  });
  expect(calls).toEqual([]);
});

test("ignores a second choice while a move is pending", async () => {
  const reply = deferred<ApiResult<null>>();
  const { control, calls } = setup(reply.promise);

  const first = choose(control, "closed", "");
  await choose(control, "reviewing", "");
  reply.settle(CHANGED);
  await first;

  expect(calls.map((call) => call.request)).toEqual([{ status: "closed" }]);
});

test("shows a refusal with what the report is now and offers to reload", async () => {
  const { control, moved } = setup(
    failed({ kind: "refused", from: "published" }),
  );

  await choose(control, "closed", "");

  expect(control.state).toEqual({
    kind: "problem",
    message: "A published report cannot be moved to closed.",
    recoveries: ["reload"],
    request: { status: "closed" },
  });
  expect(moved).not.toHaveBeenCalled();
});

test("puts a missing issue number the service reports on the field", async () => {
  const { control } = setup(failed({ kind: "issueRequired" }));
  await choose(control, "published", "5");

  await control.confirm();

  expect(control.state).toEqual({
    kind: "issueInvalid",
    message: ISSUE_NEEDED,
  });
});

test("sends the same move again when retrying after the service did not answer", async () => {
  const { control, calls } = setup(failed({ kind: "relayUnavailable" }));
  await choose(control, "closed", "");

  await control.retry();

  expect(calls.map((call) => call.request)).toEqual([
    { status: "closed" },
    { status: "closed" },
  ]);
  expect(control.state.kind).toBe("moved");
});

test("offers a reload before a retry when the answer was lost, since the move may have happened", async () => {
  const { control } = setup(failed({ kind: "timeout" }));

  await choose(control, "closed", "");

  expect(control.state).toMatchObject({
    kind: "problem",
    recoveries: ["reload", "retry"],
  });
});

test("does not retry a refusal", async () => {
  const { control, calls } = setup(failed({ kind: "refused", from: "closed" }));
  await choose(control, "published", "9");
  await control.confirm();

  await control.retry();

  expect(calls).toHaveLength(1);
});

test("refreshes the report on request and then lets the person choose again", async () => {
  const { control, refresh } = setup(
    failed({ kind: "refused", from: "closed" }),
  );
  await choose(control, "published", "9");
  await control.confirm();

  await control.reloadReport();

  expect(refresh).toHaveBeenCalledOnce();
  expect(control.state).toEqual({ kind: "idle" });
});

test("says it is reloading while the report is refreshed and ignores a second reload", async () => {
  const refreshed = deferred<undefined>();
  const refresh = vi.fn(() => refreshed.promise);
  const control = new MoveControl({
    api: { move: () => Promise.resolve(CHANGED) },
    code: CODE,
    csrf: CSRF,
    refresh,
    moved: () => Promise.resolve(),
  });

  const first = control.reloadReport();
  await control.reloadReport();
  expect(control.state).toEqual({ kind: "reloading" });
  refreshed.settle(undefined);
  await first;

  expect(refresh).toHaveBeenCalledOnce();
  expect(control.state).toEqual({ kind: "idle" });
});

test("ignores a choice while the report is reloading", async () => {
  const refreshed = deferred<undefined>();
  const calls: Call[] = [];
  const control = new MoveControl({
    api: {
      move: (code, request, csrf) => {
        calls.push({ code, request, csrf });
        return Promise.resolve(CHANGED);
      },
    },
    code: CODE,
    csrf: CSRF,
    refresh: () => refreshed.promise,
    moved: () => Promise.resolve(),
  });

  const reloading = control.reloadReport();
  await control.choose("closed");
  refreshed.settle(undefined);
  await reloading;

  expect(calls).toEqual([]);
});

test("keeps the typed issue number when the confirmation is cancelled", async () => {
  const { control } = setup();
  await choose(control, "published", "430");

  control.cancel();

  expect(control.issueDraft).toBe("430");
});

test.each(["published", "duplicate"] as const)(
  "empties the issue number once a move to %s has gone through",
  async (target) => {
    const { control } = setup();
    await choose(control, target, "430");

    await control.confirm();

    expect(control.state.kind).toBe("moved");
    expect(control.issueDraft).toBe("");
  },
);

test("keeps an issue number that a move without an issue never used", async () => {
  const { control } = setup();
  control.changeDraft("430");

  await control.choose("closed");

  expect(control.state.kind).toBe("moved");
  expect(control.issueDraft).toBe("430");
});

test("keeps the issue number when the service refuses the move", async () => {
  const { control } = setup(failed({ kind: "refused", from: "closed" }));
  await choose(control, "published", "430");

  await control.confirm();

  expect(control.state.kind).toBe("problem");
  expect(control.issueDraft).toBe("430");
});

test("keeps the issue number when the service did not answer", async () => {
  const { control } = setup(failed({ kind: "timeout" }));
  await choose(control, "published", "430");

  await control.confirm();

  expect(control.state.kind).toBe("problem");
  expect(control.issueDraft).toBe("430");
});

test("keeps a wrong issue number for the person to correct", async () => {
  const { control } = setup();

  await choose(control, "published", "abc");

  expect(control.state.kind).toBe("issueInvalid");
  expect(control.issueDraft).toBe("abc");
});
