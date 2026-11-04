import { expect, test, vi } from "vitest";

import type { ApiResult } from "#lib/api.ts";
import { reflectMove, refreshReport } from "#lib/refresh-report.ts";
import { ReportStore, type ReportState } from "#lib/report-store.svelte.ts";
import { ReportsStore } from "#lib/reports-store.svelte.ts";
import { aCode, aListed } from "#lib/testing.ts";
import type { ReportDetail } from "#lib/wire.ts";

const LISTED = aListed({ status: { kind: "closed" } });

function fakeReport(after: ReportState) {
  let state: ReportState = { kind: "loading" };
  return {
    get state() {
      return state;
    },
    refresh: vi.fn(() => {
      state = after;
      return Promise.resolve();
    }),
  };
}

test("passes the refreshed facts on to the reports list", async () => {
  const report = fakeReport({
    kind: "ready",
    detail: { listed: LISTED, report: "text", audit: [] },
  });
  const reports = { apply: vi.fn() };

  await refreshReport(report, reports);

  expect(report.refresh).toHaveBeenCalledOnce();
  expect(reports.apply).toHaveBeenCalledExactlyOnceWith(LISTED);
});

test.each([{ kind: "notFound" }, { kind: "failed", message: "x" }] as const)(
  "leaves the reports list alone when the report is %s",
  async (after) => {
    const report = fakeReport(after);
    const reports = { apply: vi.fn() };

    await refreshReport(report, reports);

    expect(reports.apply).not.toHaveBeenCalled();
  },
);

const CODE = aCode("R-1111-1111");
const OPEN = aListed({ code: CODE, status: { kind: "reviewing" } });
const CLOSED = { kind: "closed" } as const;

function ok<T>(value: T): ApiResult<T> {
  return { ok: true, value };
}

async function loadedStores(
  refreshed: ApiResult<ReportDetail> | Promise<ApiResult<ReportDetail>>,
): Promise<{ report: ReportStore; reports: ReportsStore }> {
  const detail: ReportDetail = { listed: OPEN, report: "text", audit: [] };
  const answers = [Promise.resolve(ok(detail)), Promise.resolve(refreshed)];
  const report = new ReportStore(
    { report: () => answers.shift() ?? Promise.resolve(refreshed) },
    CODE,
  );
  const reports = new ReportsStore({
    reports: () => Promise.resolve(ok({ reports: [OPEN], truncated: false })),
  });
  await Promise.all([report.reload(), reports.reload()]);
  return { report, reports };
}

test("shows and lists the new status even when the refresh that follows a move fails", async () => {
  const { report, reports } = await loadedStores({
    ok: false,
    error: { kind: "timeout" },
  });

  await reflectMove(report, reports, CLOSED);

  expect(report.state).toMatchObject({
    kind: "ready",
    detail: { listed: { status: CLOSED } },
  });
  expect(reports.state).toMatchObject({
    kind: "ready",
    reports: [{ code: CODE, status: CLOSED }],
  });
});

test("takes the refreshed audit trail once the refresh that follows a move succeeds", async () => {
  const audit = [
    { previous: "reviewing", status: CLOSED, actor: "reviewer", at: 5 },
  ] as const;
  const { report, reports } = await loadedStores(
    ok({
      listed: { ...OPEN, status: CLOSED },
      report: "text",
      audit,
    }),
  );

  await reflectMove(report, reports, CLOSED);

  expect(report.state).toMatchObject({ kind: "ready", detail: { audit } });
  expect(reports.state).toMatchObject({
    reports: [{ code: CODE, status: CLOSED }],
  });
});

test("lists the new status before the refresh answers", async () => {
  let answer: (result: ApiResult<ReportDetail>) => void = () => undefined;
  const { report, reports } = await loadedStores(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );

  const reflecting = reflectMove(report, reports, CLOSED);

  expect(reports.state).toMatchObject({ reports: [{ status: CLOSED }] });
  answer({ ok: false, error: { kind: "timeout" } });
  await reflecting;
});

test("lists what the refresh that follows a move answers, not only the status the move set", async () => {
  const { report, reports } = await loadedStores(
    ok({
      listed: { ...OPEN, status: CLOSED, version: "9.9.9" },
      report: "text",
      audit: [],
    }),
  );

  await reflectMove(report, reports, CLOSED);

  expect(reports.state).toMatchObject({
    reports: [{ code: CODE, status: CLOSED, version: "9.9.9" }],
  });
});
