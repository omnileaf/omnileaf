import { expect, test, vi } from "vitest";

import {
  replaceReportsQuery,
  type ReportsNavigation,
} from "#lib/report-navigation.ts";

function navigation() {
  const goto = vi.fn<ReportsNavigation["goto"]>(() => Promise.resolve());
  const resolve: ReportsNavigation["resolve"] = (path) => `/admin${path}`;
  return { goto, resolve };
}

test("replaces the current entry at the resolved address of the reports with the query", async () => {
  const { goto, resolve } = navigation();

  await replaceReportsQuery({ goto, resolve }, "?q=ab");

  expect(goto).toHaveBeenCalledExactlyOnceWith("/admin/reports?q=ab", {
    replace: true,
    reset: false,
  });
});

test("goes to the plain reports address without a query", async () => {
  const { goto, resolve } = navigation();

  await replaceReportsQuery({ goto, resolve }, "");

  expect(goto.mock.calls[0]?.[0]).toBe("/admin/reports");
});

test("passes on the navigation that goto returns", async () => {
  const failure = new Error("navigation aborted");
  const goto = vi.fn<ReportsNavigation["goto"]>(() => Promise.reject(failure));

  await expect(
    replaceReportsQuery({ goto, resolve: (path) => path }, "?q=a"),
  ).rejects.toBe(failure);
});
