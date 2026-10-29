import { expect, test } from "vitest";

import { isAnswered, YourReports } from "./your-reports.svelte";

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

test("keeps how a report went and a sent report's status key", () => {
  const store = memoryStore();
  const reports = new YourReports(store);

  reports.keep({
    code: "R-7K2M-QX9D",
    madeAtMs: NOON,
    way: "send",
    statusKey: "c3RhdHVz",
  });
  reports.keep({ code: "R-2QX9-0000", madeAtMs: NOON + 1, way: "copy" });

  expect(new YourReports(store).reports).toEqual([
    { code: "R-2QX9-0000", madeAtMs: NOON + 1, way: "copy" },
    { code: "R-7K2M-QX9D", madeAtMs: NOON, way: "send", statusKey: "c3RhdHVz" },
  ]);
});

test("asks after only the reports it sent", () => {
  const reports = new YourReports(memoryStore());
  reports.keep({ code: "R-2QX9", madeAtMs: NOON });
  reports.keep({ code: "R-2QX9-0000", madeAtMs: NOON + 1, way: "copy" });
  reports.keep({
    code: "R-7K2M-QX9D",
    madeAtMs: NOON + 2,
    way: "send",
    statusKey: "c3RhdHVz",
  });

  const keys = reports.sentKeys();

  expect(keys).toEqual([{ code: "R-7K2M-QX9D", statusKey: "c3RhdHVz" }]);
});

test("stops asking after a report once it is published, but not once closed", () => {
  const reports = new YourReports(memoryStore());
  for (const code of ["R-0000-0001", "R-0000-0002", "R-0000-0003"]) {
    reports.keep({ code, madeAtMs: NOON, way: "send", statusKey: "c3RhdHVz" });
  }
  reports.noteReviews([
    { code: "R-0000-0001", review: { kind: "published", issue: 412 } },
    { code: "R-0000-0002", review: { kind: "closed" } },
  ]);

  const asked = reports.sentKeys().map(({ code }) => code);

  expect(asked).toEqual(["R-0000-0003", "R-0000-0002"]);
});

test("remembers the last review it heard of, even once the relay forgets", () => {
  const store = memoryStore();
  const reports = new YourReports(store);
  reports.keep({
    code: "R-7K2M-QX9D",
    madeAtMs: NOON,
    way: "send",
    statusKey: "c3RhdHVz",
  });

  reports.noteReviews([
    { code: "R-7K2M-QX9D", review: { kind: "published", issue: 412 } },
  ]);
  reports.noteReviews([{ code: "R-7K2M-QX9D", review: { kind: "unknown" } }]);

  const [kept] = new YourReports(store).reports;
  expect(kept?.lastReview).toEqual({ kind: "published", issue: 412 });
  expect(kept !== undefined && isAnswered(kept)).toBe(true);
});

test("counts only a published or closed report as answered", () => {
  const answered = (
    [
      { kind: "received" },
      { kind: "reviewing" },
      { kind: "published", issue: 7 },
      { kind: "closed" },
    ] as const
  ).map((lastReview) =>
    isAnswered({ code: "R-7K2M-QX9D", madeAtMs: NOON, lastReview }),
  );

  expect(answered).toEqual([false, false, true, true]);
});

test("keeps a report whose stored extras it can't read", () => {
  const store = memoryStore({
    "omnileaf.yourReports":
      '[{"code":"R-7K2M-QX9D","madeAtMs":1,"way":"fax","statusKey":7,"lastReview":{"kind":"lost"}}]',
  });

  const reports = new YourReports(store);

  expect(reports.reports).toEqual([{ code: "R-7K2M-QX9D", madeAtMs: 1 }]);
});

test("keeps the status key of a report copied first and sent after", () => {
  const reports = new YourReports(memoryStore());
  reports.keep({ code: "R-7K2M-QX9D", madeAtMs: NOON, way: "copy" });

  reports.keep({
    code: "R-7K2M-QX9D",
    madeAtMs: NOON + 1,
    way: "send",
    statusKey: "c3RhdHVz",
  });

  expect(reports.reports).toEqual([
    { code: "R-7K2M-QX9D", madeAtMs: NOON, way: "send", statusKey: "c3RhdHVz" },
  ]);
});
