import { expect, test } from "vitest";

import {
  type ListedTest,
  listedTests,
  shardTestList,
  testDurations,
  testPath,
  type Timings,
} from "../shard-test-list.ts";

const REPORT = {
  suites: [
    {
      title: "about.spec.ts",
      file: "about.spec.ts",
      specs: [
        {
          title: "shows the version",
          file: "about.spec.ts",
          tests: [
            { projectName: "chromium-phone", results: [{ duration: 1200 }] },
            { projectName: "webkit-phone", results: [] },
          ],
        },
      ],
      suites: [
        {
          title: "",
          file: "about.spec.ts",
          specs: [],
          suites: [
            {
              title: "with a clipboard",
              file: "about.spec.ts",
              specs: [
                {
                  title: "copies the details",
                  file: "about.spec.ts",
                  tests: [
                    {
                      projectName: "chromium-phone",
                      results: [{ duration: 300 }, { duration: 400 }],
                    },
                  ],
                },
              ],
            },
          ],
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
              tests: [{ projectName: "webkit-phone", results: [] }],
            },
          ],
        },
      ],
    },
  ],
};

function listed(project: string, ...titles: string[]): ListedTest {
  return { project, file: "a.spec.ts", declaredIn: "a.spec.ts", titles };
}

function declaredInHelper(
  file: string,
  project: string,
  ...titles: string[]
): ListedTest {
  return { project, file, declaredIn: "checks.ts", titles };
}

function shardsOf(
  tests: readonly ListedTest[],
  timings: Timings,
  total: number,
): string[][] {
  return Array.from({ length: total }, (_, index) =>
    shardTestList(tests, timings, { current: index + 1, total }),
  );
}

interface TestListLine {
  readonly project: string;
  readonly file: string | undefined;
  readonly titles: readonly string[];
}

/** Mirrors how Playwright 1.64 reads a `--test-list` line: it splits on `›` when the line has one, else on `>`, and trims each part. */
function parsed(line: string): TestListLine {
  const delimiter = line.includes("›") ? "›" : ">";
  const [project = "", file, ...titles] = line
    .split(delimiter)
    .map((token) => token.trim());
  return { project, file, titles };
}

/** Mirrors how Playwright 1.64 runs a `--test-list`: it loads only the spec files the lines name, then runs a test when a line names its project and the file declaring it, and starts its title path. */
function runs(lines: readonly string[], listedTest: ListedTest): boolean {
  const parsedLines = lines.map(parsed);
  return (
    parsedLines.some(({ file }) => file === listedTest.file) &&
    parsedLines.some(
      ({ project, file, titles }) =>
        project === `[${listedTest.project}]` &&
        file === listedTest.declaredIn &&
        titles.length <= listedTest.titles.length &&
        titles.every((title, index) => listedTest.titles[index] === title),
    )
  );
}

function shardsRunning(
  shards: readonly (readonly string[])[],
  listedTest: ListedTest,
): number[] {
  return shards.flatMap((lines, index) =>
    runs(lines, listedTest) ? [index] : [],
  );
}

test("names a test by its spec file and titles", () => {
  expect(testPath(listed("webkit-phone", "settings", "opens"))).toBe(
    "a.spec.ts › settings › opens",
  );
});

test("lists every test in a report once per project, with the file declaring it, leaving out untitled describes", () => {
  const tests = listedTests(REPORT);

  expect(tests).toEqual([
    {
      project: "chromium-phone",
      file: "about.spec.ts",
      declaredIn: "about.spec.ts",
      titles: ["shows the version"],
    },
    {
      project: "webkit-phone",
      file: "about.spec.ts",
      declaredIn: "about.spec.ts",
      titles: ["shows the version"],
    },
    {
      project: "chromium-phone",
      file: "about.spec.ts",
      declaredIn: "about.spec.ts",
      titles: ["with a clipboard", "copies the details"],
    },
    {
      project: "webkit-phone",
      file: "screens.spec.ts",
      declaredIn: "screen-checks.ts",
      titles: ["in the dark theme", "holds still"],
    },
  ]);
});

test("times each test by adding up its attempts, leaving out a test that never ran", () => {
  const timings = testDurations(REPORT);

  expect(timings).toEqual({
    "about.spec.ts › shows the version": { "chromium-phone": 1200 },
    "about.spec.ts › with a clipboard › copies the details": {
      "chromium-phone": 700,
    },
  });
});

test("rejects a report that is not a Playwright JSON report", () => {
  expect(() => listedTests({ tests: [] })).toThrow("suites");
});

test("gives the longest tests their own shards first", () => {
  const tests = ["a", "b", "c", "d"].map((title) => listed("p", title));
  const timings = {
    "a.spec.ts › a": { p: 10 },
    "a.spec.ts › b": { p: 5 },
    "a.spec.ts › c": { p: 4 },
    "a.spec.ts › d": { p: 1 },
  };

  const shards = shardsOf(tests, timings, 2);

  expect(shards).toEqual([
    ["[p] › a.spec.ts › a"],
    ["[p] › a.spec.ts › b", "[p] › a.spec.ts › c", "[p] › a.spec.ts › d"],
  ]);
});

test("times a test missing from the timings at the median", () => {
  const tests = ["a", "b", "c", "new"].map((title) => listed("p", title));
  const timings = {
    "a.spec.ts › a": { p: 10 },
    "a.spec.ts › b": { p: 3 },
    "a.spec.ts › c": { p: 2 },
    "a.spec.ts › gone": { p: 1 },
  };

  const shards = shardsOf(tests, timings, 2);

  expect(shards).toEqual([
    ["[p] › a.spec.ts › a"],
    ["[p] › a.spec.ts › b", "[p] › a.spec.ts › new", "[p] › a.spec.ts › c"],
  ]);
});

test("puts the same tests in the same shards whatever order they are listed in", () => {
  const tests = ["a", "b", "c", "d", "e"].map((title) => listed("p", title));

  const shards = shardsOf(tests, {}, 3);
  const reversed = shardsOf(tests.toReversed(), {}, 3);

  expect(reversed).toEqual(shards);
});

test("lists every test in exactly one shard, even when a title cannot be written in a test list", () => {
  const tests = [
    listed("chromium-phone", "opens Settings › Library"),
    listed("chromium-phone", "Settings", "opens"),
    listed("chromium-phone", "Settings", "has 2 > 1 items"),
    listed("chromium-phone", "Settings", " padded"),
    listed("chromium-phone", "Settings"),
    listed("chromium-phone", "menu", "opens"),
    listed("chromium-phone", "menu", "opens", "twice"),
    listed("chromium-phone", "menu", "closes"),
    listed("webkit-phone", "menu", "opens"),
    listed("webkit-phone", "menu", "closes"),
    declaredInHelper("light.spec.ts", "webkit-phone", "holds still"),
    declaredInHelper("light.spec.ts", "webkit-phone", "fits", "at 360px"),
    declaredInHelper("dark.spec.ts", "webkit-phone", "fits", "at 390px"),
    declaredInHelper("dark.spec.ts", "chromium-phone", "holds still"),
    ...Array.from({ length: 40 }, (_, index) =>
      listed("webkit-tablet", `test ${String(index)}`),
    ),
  ];

  const shards = shardsOf(tests, {}, 7);

  for (const listedTest of tests) {
    expect(
      shardsRunning(shards, listedTest),
      `${listedTest.project} ${testPath(listedTest)}`,
    ).toHaveLength(1);
  }
});

test("loads the spec file of a test declared in a helper without running any other test", () => {
  const tests = [
    declaredInHelper("light.spec.ts", "p", "holds still"),
    listed("p", "a"),
  ];

  const shards = shardsOf(tests, {}, 2);

  expect(shards).toContainEqual([
    "[p] › checks.ts › holds still",
    "[load only] › light.spec.ts",
  ]);
});

test("rejects a project that a line loading a file would run", () => {
  expect(() =>
    shardTestList([listed("load only", "a")], {}, { current: 1, total: 1 }),
  ).toThrow("load only");
});

test("keeps a test whose title cannot be written in a test list with the rest of its describe", () => {
  const tests = [
    listed("p", "Settings", "opens Settings › Library"),
    listed("p", "Settings", "opens"),
    listed("p", "other"),
  ];

  const shards = shardsOf(tests, {}, 2);

  expect(shards).toContainEqual(["[p] › a.spec.ts › Settings"]);
});

test("rejects more shards than there are tests to share out", () => {
  expect(() =>
    shardTestList([listed("p", "a")], {}, { current: 1, total: 2 }),
  ).toThrow("2 shards");
});
