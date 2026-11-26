import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  type FlakyTest,
  flakyAnnotations,
  flakySummary,
  flakyTests,
  flakyTestsInFolder,
} from "../flaky-tests.ts";

function run(projectName: string, status: string) {
  return {
    projectName,
    status,
    results: [
      { retry: 0, status: "failed" },
      { retry: 1, status: "passed" },
    ],
  };
}

const REPORT = {
  suites: [
    {
      title: "library.spec.ts",
      file: "library.spec.ts",
      specs: [
        {
          title: "opens a series",
          file: "library.spec.ts",
          line: 12,
          tests: [
            run("chromium-phone", "expected"),
            run("webkit-phone", "flaky"),
          ],
        },
      ],
      suites: [
        {
          title: "with a filter",
          file: "library.spec.ts",
          specs: [
            {
              title: "keeps the filter",
              file: "library.spec.ts",
              line: 40,
              tests: [run("webkit-desktop", "flaky")],
            },
            {
              title: "never passes",
              file: "library.spec.ts",
              line: 55,
              tests: [run("webkit-desktop", "unexpected")],
            },
          ],
          suites: [],
        },
      ],
    },
    {
      title: "screens.spec.ts",
      file: "screens.spec.ts",
      specs: [],
      suites: [
        {
          title: "in the dark theme",
          file: "screens.spec.ts",
          specs: [
            {
              title: "holds still",
              file: "screen-checks.ts",
              line: 7,
              tests: [run("chromium-phone", "flaky")],
            },
          ],
          suites: [],
        },
      ],
    },
  ],
};

const ONE_FLAKY_TEST: FlakyTest = {
  shard: "rest 3/24",
  project: "webkit-phone",
  file: "app/tests/browser/library.spec.ts",
  line: 12,
  title: "opens a series",
};

test("finds the tests that passed only on a retry, with where they are declared", () => {
  const found = flakyTests(REPORT, "app/tests/browser", "rest 3/24");

  expect(found).toEqual([
    {
      shard: "rest 3/24",
      project: "webkit-phone",
      file: "app/tests/browser/library.spec.ts",
      line: 12,
      title: "opens a series",
    },
    {
      shard: "rest 3/24",
      project: "webkit-desktop",
      file: "app/tests/browser/library.spec.ts",
      line: 40,
      title: "with a filter › keeps the filter",
    },
    {
      shard: "rest 3/24",
      project: "chromium-phone",
      file: "app/tests/browser/screen-checks.ts",
      line: 7,
      title: "in the dark theme › holds still",
    },
  ]);
});

test("finds nothing flaky in a run where every test passed first time", () => {
  const report = {
    suites: [
      {
        file: "a.spec.ts",
        specs: [
          {
            title: "a",
            file: "a.spec.ts",
            line: 1,
            tests: [run("chromium-phone", "expected")],
          },
        ],
      },
    ],
  };

  expect(flakyTests(report, "app/tests/browser", "rest 1/24")).toEqual([]);
});

test("rejects a report that is not a Playwright JSON report", () => {
  expect(() =>
    flakyTests({ tests: [] }, "app/tests/browser", "rest 1/1"),
  ).toThrow("suites");
});

test("annotates each flaky test at its file and line as a warning", () => {
  const lines = flakyAnnotations([ONE_FLAKY_TEST]);

  expect(lines).toEqual([
    "::warning file=app/tests/browser/library.spec.ts,line=12,title=Flaky browser test::[webkit-phone] opens a series passed only on its retry in shard rest 3/24",
  ]);
});

test("escapes what would end an annotation early", () => {
  const lines = flakyAnnotations([
    {
      ...ONE_FLAKY_TEST,
      file: "app/tests/browser/a,b:c.spec.ts",
      title: "50% of\nlines",
    },
  ]);

  expect(lines).toEqual([
    "::warning file=app/tests/browser/a%2Cb%3Ac.spec.ts,line=12,title=Flaky browser test::[webkit-phone] 50%25 of%0Alines passed only on its retry in shard rest 3/24",
  ]);
});

test("lists each flaky test in a table, keeping a | in a title from splitting its row", () => {
  const summary = flakySummary([
    ONE_FLAKY_TEST,
    { ...ONE_FLAKY_TEST, title: "shows a | b", line: 30, shard: "rest 4/24" },
  ]);

  expect(summary).toBe(
    [
      "### Flaky browser tests",
      "",
      "These passed only on their retry. A first-failure trace is in the shard's traces artifact.",
      "",
      "| Shard | Project | Test | Declared at |",
      "| --- | --- | --- | --- |",
      "| rest 3/24 | webkit-phone | opens a series | app/tests/browser/library.spec.ts:12 |",
      "| rest 4/24 | webkit-phone | shows a \\| b | app/tests/browser/library.spec.ts:30 |",
      "",
    ].join("\n"),
  );
});

test("says nothing in the summary when no test was flaky", () => {
  expect(flakySummary([])).toBe("");
});

function foldersHolding(
  files: Readonly<Record<string, readonly FlakyTest[]>>,
): string {
  const folder = mkdtempSync(join(tmpdir(), "omnileaf-flaky-"));
  for (const [path, tests] of Object.entries(files)) {
    mkdirSync(join(folder, path, ".."), { recursive: true });
    writeFileSync(join(folder, path), JSON.stringify(tests));
  }
  return folder;
}

test("gathers the flaky tests every shard's artifact holds", () => {
  const other = { ...ONE_FLAKY_TEST, shard: "screens 2/8" };
  const folder = foldersHolding({
    "flaky-tests-rest-3/flaky-tests.json": [ONE_FLAKY_TEST],
    "flaky-tests-screens-2/flaky-tests.json": [other],
    "flaky-tests-screens-2/browser-test-report.json": [],
  });

  expect(flakyTestsInFolder(folder)).toEqual([ONE_FLAKY_TEST, other]);
});

test("finds no flaky tests in a folder no shard wrote an artifact to", () => {
  const folder = join(mkdtempSync(join(tmpdir(), "omnileaf-flaky-")), "none");

  expect(flakyTestsInFolder(folder)).toEqual([]);
});

test("rejects an artifact holding something that is not a flaky test", () => {
  const folder = mkdtempSync(join(tmpdir(), "omnileaf-flaky-"));
  writeFileSync(join(folder, "flaky-tests.json"), '[{"title":"a"}]');

  expect(() => flakyTestsInFolder(folder)).toThrow("Not a flaky test");
});
