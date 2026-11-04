import { expect, test, vi } from "vitest";

import { retryReports } from "#lib/retry-reports.ts";

test("reloads the reports and then moves focus to the page heading", async () => {
  const steps: string[] = [];
  const reload = vi.fn(() => {
    steps.push("reloaded");
    return Promise.resolve();
  });

  await retryReports({ reload }, () => {
    steps.push("focused");
  });

  expect(reload).toHaveBeenCalledOnce();
  expect(steps).toEqual(["reloaded", "focused"]);
});
