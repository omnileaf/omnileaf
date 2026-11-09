import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  FilterSync,
  SEARCH_WRITE_DELAY_MS,
  type FilterSyncDeps,
} from "#lib/filter-sync.svelte.ts";
import type { NavigationType } from "#lib/navigation.ts";
import type { ReportsNavigation } from "#lib/report-navigation.ts";
import type { ReportFilter } from "#lib/reports.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(address = "") {
  let params = new URLSearchParams(address);
  const goto = vi.fn<ReportsNavigation["goto"]>(() => Promise.resolve());
  const report = vi.fn<(error: unknown) => void>();
  const deps: FilterSyncDeps = {
    readUrl: () => params,
    navigation: { goto, resolve: (path) => path },
    report,
  };
  return {
    sync: new FilterSync(deps),
    goto,
    report,
    written: () => goto.mock.calls.map(([url]) => url),
    moveTo: (next: string) => {
      params = new URLSearchParams(next);
    },
  };
}

test("starts from the filter in the address", () => {
  const { sync, goto } = setup("status=closed&q=ab");

  expect(sync.filter).toEqual({ status: "closed", search: "ab" });
  expect(goto).not.toHaveBeenCalled();
});

test("shows every typed letter at once and writes the address once after a pause", () => {
  const { sync, written } = setup();

  sync.change({ search: "a" });
  vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS - 1);
  sync.change({ search: "ab" });
  expect(sync.filter).toEqual({ search: "ab" });
  expect(written()).toEqual([]);
  vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS);

  expect(written()).toEqual(["/reports?q=ab"]);
});

test("replaces the history entry without resetting focus when it writes", () => {
  const { sync, goto } = setup();

  sync.change({ status: "closed" });

  expect(goto.mock.calls[0]?.[1]).toEqual({ replace: true, reset: false });
});

const SELECTS = [
  [{ search: "ab", status: "closed" }, "/reports?q=ab&status=closed"],
  [{ search: "ab", platform: "linux" }, "/reports?q=ab&platform=linux"],
  [{ search: "ab", version: "1.2.0" }, "/reports?q=ab&version=1.2.0"],
] as const satisfies readonly (readonly [ReportFilter, string])[];

test.each(SELECTS)(
  "writes a select change %j at once with the search typed so far and drops the pending write",
  (next, address) => {
    const { sync, written } = setup();

    sync.change({ search: "ab" });
    sync.change(next);
    expect(written()).toEqual([address]);
    vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS * 2);

    expect(written()).toEqual([address]);
    expect(sync.filter).toEqual(next);
  },
);

test("keeps the chosen select in the write that follows more typing", () => {
  const { sync, written } = setup();

  sync.change({ status: "closed" });
  sync.change({ status: "closed", search: "x" });
  vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS);

  expect(written()).toEqual([
    "/reports?status=closed",
    "/reports?q=x&status=closed",
  ]);
});

test("writes clearing the filters at once", () => {
  const { sync, written } = setup("status=closed&q=ab");

  sync.change({});

  expect(written()).toEqual(["/reports"]);
  expect(sync.filter).toEqual({});
});

test("writes clearing a lone search at once instead of waiting for a pause", () => {
  const { sync, written } = setup("q=ab");

  sync.change({});
  expect(written()).toEqual(["/reports"]);
  vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS * 2);

  expect(written()).toEqual(["/reports"]);
});

test.each([
  "enter",
  "link",
  "popstate",
  "form",
] as const satisfies readonly NavigationType[])(
  "takes the filter of the address after a %s navigation and drops the pending write",
  (type) => {
    const { sync, goto, moveTo } = setup();
    sync.change({ search: "typed" });

    moveTo("platform=linux");
    sync.adoptAfterNavigation({ type });
    vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS * 2);

    expect(sync.filter).toEqual({ platform: "linux" });
    expect(goto).not.toHaveBeenCalled();
  },
);

test("keeps what was typed after its own write navigated", () => {
  const { sync, moveTo, goto } = setup();
  sync.change({ search: "typed" });

  moveTo("q=old");
  sync.adoptAfterNavigation({ type: "goto" });
  vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS);

  expect(sync.filter).toEqual({ search: "typed" });
  expect(goto).toHaveBeenCalledTimes(1);
});

test("writes nothing after it was disposed with a write pending", () => {
  const { sync, goto } = setup();
  sync.change({ search: "typed" });

  sync.dispose();
  vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS * 2);

  expect(goto).not.toHaveBeenCalled();
});

test.each(["navigation aborted", "navigation cancelled"])(
  "ignores a write that a newer navigation superseded (%s)",
  async (message) => {
    const { sync, goto, report } = setup();
    goto.mockRejectedValueOnce(new Error(message));

    sync.change({ status: "closed" });
    await vi.advanceTimersByTimeAsync(0);

    expect(report).not.toHaveBeenCalled();
  },
);

test("reports a write that failed for any other reason", async () => {
  const { sync, goto, report } = setup();
  const failure = new Error("navigation exploded");
  goto.mockRejectedValueOnce(failure);

  sync.change({ status: "closed" });
  await vi.advanceTimersByTimeAsync(0);

  expect(report).toHaveBeenCalledExactlyOnceWith(failure);
});

test("reports a rejection that is not an error", async () => {
  const { sync, goto, report } = setup();
  goto.mockRejectedValueOnce("navigation aborted");

  sync.change({ status: "closed" });
  await vi.advanceTimersByTimeAsync(0);

  expect(report).toHaveBeenCalledExactlyOnceWith("navigation aborted");
});

test("keeps what was typed when an older write finishes late", async () => {
  const { sync, goto } = setup();
  let finish: () => void = () => undefined;
  goto.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );

  sync.change({ status: "closed" });
  sync.change({ status: "closed", search: "abc" });
  finish();
  await vi.advanceTimersByTimeAsync(0);

  expect(sync.filter).toEqual({ status: "closed", search: "abc" });
});
