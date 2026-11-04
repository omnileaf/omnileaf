import { expect, test } from "vitest";

import { copy } from "#lib/copy.ts";
import { resultsSummary } from "#lib/results-summary.ts";

test.each([
  [9, 9, "9 reports"],
  [1, 1, "1 report"],
  [3, 9, "3 of 9 reports"],
  [1, 9, "1 of 9 reports"],
  [0, 9, "0 of 9 reports"],
])(
  "summarises %i of the %i reports of a complete list as %s",
  (shown, total, words) => {
    expect(resultsSummary(shown, total, "all")).toBe(words);
  },
);

test.each([
  [500, 500, "The newest 500 reports"],
  [12, 500, "12 of the newest 500 reports"],
  [0, 500, "0 of the newest 500 reports"],
])(
  "summarises %i of the %i reports of a cut off list as %s",
  (shown, total, words) => {
    expect(resultsSummary(shown, total, "newest")).toBe(words);
  },
);

test("takes its sentences from the copy", () => {
  expect(copy.reports.summary.newest).toContain("{total}");
  expect(copy.reports.summary.all.other).toContain("{total}");
});
