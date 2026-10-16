import { expect, test } from "vitest";

import { YourReports } from "./your-reports.svelte";

const NOON = new Date(2026, 9, 16, 12).getTime();

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("keeps each report once, newest first, for the next time", () => {
  const store = memoryStore();
  const reports = new YourReports(store);

  reports.keep({ code: "R-2QX9", madeAtMs: NOON });
  reports.keep({ code: "R-7F3K", madeAtMs: NOON + 1 });
  reports.keep({ code: "R-2QX9", madeAtMs: NOON + 2 });

  expect(new YourReports(store).reports).toEqual([
    { code: "R-7F3K", madeAtMs: NOON + 1 },
    { code: "R-2QX9", madeAtMs: NOON },
  ]);
});

test("reads nothing from storage holding something else", () => {
  const store = memoryStore({
    "omnileaf.yourReports": '[{"code":7},"R-1234",{"code":"R-8M4T"}]',
  });

  const reports = new YourReports(store);

  expect(reports.reports).toEqual([]);
});

test("keeps reports for this visit when storage refuses them", () => {
  const reports = new YourReports(undefined);

  reports.keep({ code: "R-8M4T", madeAtMs: NOON });

  expect(reports.reports).toEqual([{ code: "R-8M4T", madeAtMs: NOON }]);
});
