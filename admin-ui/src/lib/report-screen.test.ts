import { expect, test, vi } from "vitest";

import type { Api, ApiResult } from "#lib/api.ts";
import { ReportScreen } from "#lib/report-screen.svelte.ts";
import { ReportsStore } from "#lib/reports-store.svelte.ts";
import { aCode, aListed } from "#lib/testing.ts";
import type {
  Listed,
  MoveRequest,
  ReportCode,
  ReportDetail,
  Status,
} from "#lib/wire.ts";

const FIRST = aCode("R-1111-1111");
const SECOND = aCode("R-2222-2222");
const CSRF = "token-1";
const MICROTASK_TURNS = 25;
const REVIEWING: Status = { kind: "reviewing" };
const CLOSED: Status = { kind: "closed" };

function listed(code: ReportCode, status: Status = REVIEWING): Listed {
  return aListed({ code, status });
}

function detail(code: ReportCode, status: Status = REVIEWING): ReportDetail {
  return { listed: listed(code, status), report: "text", audit: [] };
}

function ok<T>(value: T): ApiResult<T> {
  return { ok: true, value };
}

function deferred<T>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

interface MoveCall {
  readonly code: ReportCode;
  readonly request: MoveRequest;
  readonly csrf: string;
}

interface FakeApi {
  readonly api: Pick<Api, "report" | "move">;
  readonly moves: MoveCall[];
  readonly reads: ReportCode[];
}

function fakeApi(
  reports: (read: number, code: ReportCode) => Promise<ApiResult<ReportDetail>>,
  moved: () => Promise<ApiResult<null>> = () => Promise.resolve(ok(null)),
): FakeApi {
  const moves: MoveCall[] = [];
  const reads: ReportCode[] = [];
  return {
    api: {
      report: (code) => {
        reads.push(code);
        return reports(reads.length, code);
      },
      move: (code, request, csrf) => {
        moves.push({ code, request, csrf });
        return moved();
      },
    },
    moves,
    reads,
  };
}

async function listStore(...entries: Listed[]): Promise<ReportsStore> {
  const store = new ReportsStore({
    reports: () => Promise.resolve(ok({ reports: entries, truncated: false })),
  });
  await store.reload();
  return store;
}

function listedStatus(
  store: ReportsStore,
  code: ReportCode,
): Status | undefined {
  return store.state.kind === "ready"
    ? store.state.reports.find((entry) => entry.code === code)?.status
    : undefined;
}

function screenOf(
  fake: FakeApi,
  reports: ReportsStore,
  code: string = FIRST,
  focusHeading: () => void = () => undefined,
): ReportScreen {
  return new ReportScreen({
    api: fake.api,
    reports,
    code,
    csrf: CSRF,
    focusHeading,
    settle: () => Promise.resolve(),
  });
}

test("loads the report it was made for", async () => {
  const fake = fakeApi((_read, code) => Promise.resolve(ok(detail(code))));
  const screen = screenOf(fake, await listStore(listed(FIRST)));

  await screen.load();

  expect(fake.reads).toEqual([FIRST]);
  expect(screen.report.state).toEqual({ kind: "ready", detail: detail(FIRST) });
});

test("offers no moves without a session token or for a code that cannot be a report", () => {
  const fake = fakeApi(() => Promise.reject(new Error("no read")));

  const reports = new ReportsStore({
    reports: () => Promise.reject(new Error("no list")),
  });

  expect(
    new ReportScreen({
      api: fake.api,
      reports,
      code: FIRST,
      csrf: undefined,
      focusHeading: () => undefined,
      settle: () => Promise.resolve(),
    }).move,
  ).toBeUndefined();
  expect(screenOf(fake, reports, "nope").move).toBeUndefined();
  expect(screenOf(fake, reports, FIRST).move).toBeDefined();
});

test("sends the session token with a move", async () => {
  const fake = fakeApi((_read, code) => Promise.resolve(ok(detail(code))));
  const screen = screenOf(fake, await listStore(listed(FIRST)));
  await screen.load();

  screen.move?.onChoose("closed");
  await flush();

  expect(fake.moves).toEqual([
    { code: FIRST, request: { status: "closed" }, csrf: CSRF },
  ]);
});

async function flush(): Promise<void> {
  for (let turn = 0; turn < MICROTASK_TURNS; turn += 1) {
    await Promise.resolve();
  }
}

test("shows and lists the new status when the refresh after a move fails", async () => {
  const fake = fakeApi((read, code) =>
    read === 1
      ? Promise.resolve(ok(detail(code)))
      : Promise.resolve({ ok: false, error: { kind: "timeout" } }),
  );
  const reports = await listStore(listed(FIRST));
  const screen = screenOf(fake, reports);
  await screen.load();

  screen.move?.onChoose("closed");
  await flush();

  expect(screen.move?.state).toEqual({
    kind: "moved",
    announcement: "Moved to Closed.",
  });
  expect(screen.report.state).toMatchObject({
    kind: "ready",
    detail: { listed: { status: CLOSED } },
  });
  expect(listedStatus(reports, FIRST)).toEqual(CLOSED);
});

test("keeps the card on screen and the draft cleared after a published move whose refresh fails", async () => {
  const fake = fakeApi((read, code) =>
    read === 1
      ? Promise.resolve(ok(detail(code)))
      : Promise.resolve({ ok: false, error: { kind: "relayUnavailable" } }),
  );
  const screen = screenOf(fake, await listStore(listed(FIRST)));
  await screen.load();

  screen.move?.onDraftChange("430");
  screen.move?.onChoose("published");
  screen.move?.onConfirm();
  await flush();

  expect(screen.report.state.kind).toBe("ready");
  expect(screen.move?.state.kind).toBe("moved");
  expect(screen.move?.draft).toBe("");
});

test("lists the status of the report it was made for when the person has moved on to another one", async () => {
  const slowMove = deferred<ApiResult<null>>();
  const first = fakeApi(
    (read, code) =>
      Promise.resolve(ok(detail(code, read === 1 ? REVIEWING : CLOSED))),
    () => slowMove.promise,
  );
  const second = fakeApi((_read, code) => Promise.resolve(ok(detail(code))));
  const reports = await listStore(listed(FIRST), listed(SECOND));
  const screenOne = screenOf(first, reports, FIRST);
  await screenOne.load();
  screenOne.move?.onChoose("closed");
  await Promise.resolve();

  const screenTwo = screenOf(second, reports, SECOND);
  await screenTwo.load();
  slowMove.settle(ok(null));
  await flush();

  expect(listedStatus(reports, FIRST)).toEqual(CLOSED);
  expect(listedStatus(reports, SECOND)).toEqual(REVIEWING);
  expect(screenTwo.report.state).toEqual({
    kind: "ready",
    detail: detail(SECOND),
  });
  expect(second.reads).toEqual([SECOND]);
  expect(second.moves).toEqual([]);
  expect(first.reads).toEqual([FIRST, FIRST]);
});

test("passes what is typed, confirmed and cancelled on to the move", async () => {
  const fake = fakeApi((_read, code) => Promise.resolve(ok(detail(code))));
  const screen = screenOf(fake, await listStore(listed(FIRST)));
  await screen.load();

  screen.move?.onDraftChange("430");
  screen.move?.onChoose("published");
  expect(screen.move?.draft).toBe("430");
  expect(screen.move?.state).toEqual({
    kind: "confirming",
    request: { status: "published", issue: 430 },
  });
  screen.move?.onCancel();
  expect(screen.move?.state).toEqual({ kind: "idle" });
  expect(screen.move?.draft).toBe("430");
  expect(fake.moves).toEqual([]);

  screen.move?.onChoose("published");
  screen.move?.onConfirm();
  await flush();

  expect(fake.moves).toEqual([
    { code: FIRST, request: { status: "published", issue: 430 }, csrf: CSRF },
  ]);
});

test("retries a move the service did not answer and reloads a refused one", async () => {
  let attempt = 0;
  const fake = fakeApi(
    (_read, code) => Promise.resolve(ok(detail(code))),
    () => {
      attempt += 1;
      return Promise.resolve(
        attempt === 1
          ? { ok: false, error: { kind: "relayUnavailable" } }
          : ok(null),
      );
    },
  );
  const screen = screenOf(fake, await listStore(listed(FIRST)));
  await screen.load();

  screen.move?.onChoose("closed");
  await flush();
  expect(screen.move?.state.kind).toBe("problem");
  screen.move?.onRetry();
  await flush();

  expect(fake.moves).toHaveLength(2);
  expect(screen.move?.state.kind).toBe("moved");
});

test("reloads the report when asked to after a refusal", async () => {
  const fake = fakeApi(
    (_read, code) => Promise.resolve(ok(detail(code))),
    () =>
      Promise.resolve({
        ok: false,
        error: { kind: "refused", from: "closed" },
      }),
  );
  const screen = screenOf(fake, await listStore(listed(FIRST)));
  await screen.load();
  screen.move?.onChoose("closed");
  await flush();

  screen.move?.onReload();
  await flush();

  expect(fake.reads).toEqual([FIRST, FIRST]);
  expect(screen.move?.state).toEqual({ kind: "idle" });
});

test("lists what the reload answers when the report had moved on without us", async () => {
  const fake = fakeApi(
    (read, code) =>
      Promise.resolve(ok(detail(code, read === 1 ? REVIEWING : CLOSED))),
    () =>
      Promise.resolve({
        ok: false,
        error: { kind: "refused", from: "closed" },
      }),
  );
  const reports = await listStore(listed(FIRST));
  const screen = screenOf(fake, reports);
  await screen.load();
  screen.move?.onDraftChange("9");
  screen.move?.onChoose("published");
  screen.move?.onConfirm();
  await flush();
  expect(listedStatus(reports, FIRST)).toEqual(REVIEWING);

  screen.move?.onReload();
  await flush();

  expect(listedStatus(reports, FIRST)).toEqual(CLOSED);
});

function lostAnswerThenReload(
  reload: ApiResult<ReportDetail>,
): (read: number, code: ReportCode) => Promise<ApiResult<ReportDetail>> {
  return (read, code) =>
    Promise.resolve(read === 1 ? ok(detail(code)) : reload);
}

test.each([
  ["fails", { ok: false, error: { kind: "timeout" } }],
  ["finds no such report", { ok: false, error: { kind: "notFound" } }],
] as const)(
  "moves focus to the heading when the reload after a lost answer %s",
  async (_outcome, reloaded) => {
    const fake = fakeApi(lostAnswerThenReload(reloaded), () =>
      Promise.resolve({ ok: false, error: { kind: "timeout" } }),
    );
    const focusHeading = vi.fn();
    const screen = screenOf(
      fake,
      await listStore(listed(FIRST)),
      FIRST,
      focusHeading,
    );
    await screen.load();
    screen.move?.onChoose("closed");
    await flush();
    expect(focusHeading).not.toHaveBeenCalled();

    screen.move?.onReload();
    await flush();

    expect(screen.report.state.kind).not.toBe("ready");
    expect(focusHeading).toHaveBeenCalledOnce();
  },
);

test("leaves the focus to the card when the reload after a lost answer shows the report", async () => {
  const fake = fakeApi(lostAnswerThenReload(ok(detail(FIRST))), () =>
    Promise.resolve({ ok: false, error: { kind: "timeout" } }),
  );
  const focusHeading = vi.fn();
  const screen = screenOf(
    fake,
    await listStore(listed(FIRST)),
    FIRST,
    focusHeading,
  );
  await screen.load();
  screen.move?.onChoose("closed");
  await flush();

  screen.move?.onReload();
  await flush();

  expect(screen.report.state.kind).toBe("ready");
  expect(focusHeading).not.toHaveBeenCalled();
});

test("waits for the page to settle before it moves focus to the heading", async () => {
  const steps: string[] = [];
  const fake = fakeApi(
    lostAnswerThenReload({ ok: false, error: { kind: "timeout" } }),
    () => Promise.resolve({ ok: false, error: { kind: "timeout" } }),
  );
  const screen = new ReportScreen({
    api: fake.api,
    reports: await listStore(listed(FIRST)),
    code: FIRST,
    csrf: CSRF,
    focusHeading: () => {
      steps.push("focus");
    },
    settle: () => {
      steps.push("settle");
      return Promise.resolve();
    },
  });
  await screen.load();
  screen.move?.onChoose("closed");
  await flush();

  screen.move?.onReload();
  await flush();

  expect(steps).toEqual(["settle", "focus"]);
});
