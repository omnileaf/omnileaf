import { isRecord, listOf } from "./app/json.ts";
import type { Shard } from "./shard.ts";

export interface ListedTest {
  readonly project: string;
  readonly file: string;
  readonly declaredIn: string;
  readonly titles: readonly string[];
}

export type Timings = Readonly<
  Record<string, Readonly<Record<string, number>>>
>;

export interface TestListMismatch {
  readonly missing: readonly ListedTest[];
  readonly extra: readonly ListedTest[];
}

interface TestRun {
  readonly test: ListedTest;
  readonly durationMs: number | undefined;
}

interface Scope {
  readonly file: string;
  readonly describes: readonly string[];
}

interface Unit {
  readonly line: string;
  readonly tests: readonly ListedTest[];
  readonly specFiles: ReadonlySet<string>;
  readonly durationMs: number;
}

interface Bin {
  readonly units: Unit[];
  durationMs: number;
}

const TITLE_SEPARATOR = " › ";
const TEST_LIST_SEPARATORS = /[\n\r›]/u;
const DURATION_WITHOUT_TIMINGS_MS = 1;
const LOAD_ONLY_PROJECT = "load only";

export function testPath(test: ListedTest): string {
  return [test.file, ...test.titles].join(TITLE_SEPARATOR);
}

export function listedTests(report: unknown): ListedTest[] {
  return testRuns(report).map(({ test }) => test);
}

export function testDurations(report: unknown): Timings {
  const timings: Record<string, Record<string, number>> = {};
  for (const { test, durationMs } of testRuns(report)) {
    if (durationMs === undefined) {
      continue;
    }
    timings[testPath(test)] = {
      ...timings[testPath(test)],
      [test.project]: durationMs,
    };
  }
  return timings;
}

function testRuns(report: unknown): TestRun[] {
  if (!isRecord(report) || !Array.isArray(report.suites)) {
    throw new Error("Expected a Playwright JSON report with suites");
  }
  return report.suites.flatMap((suite) =>
    isRecord(suite) && typeof suite.file === "string"
      ? suiteRuns(suite, { file: suite.file, describes: [] })
      : [],
  );
}

function suiteRuns(suite: unknown, scope: Scope): TestRun[] {
  if (!isRecord(suite)) {
    return [];
  }
  const specs = listOf(suite.specs).flatMap((spec) => specRuns(spec, scope));
  const nested = listOf(suite.suites).flatMap((child) =>
    suiteRuns(child, {
      ...scope,
      describes: [...scope.describes, ...describeTitle(child)],
    }),
  );
  return [...specs, ...nested];
}

function describeTitle(suite: unknown): string[] {
  return isRecord(suite) && typeof suite.title === "string" && suite.title
    ? [suite.title]
    : [];
}

function specRuns(spec: unknown, { file, describes }: Scope): TestRun[] {
  if (
    !isRecord(spec) ||
    typeof spec.title !== "string" ||
    typeof spec.file !== "string"
  ) {
    return [];
  }
  const { title, file: declaredIn } = spec;
  return listOf(spec.tests).flatMap((run) =>
    isRecord(run) && typeof run.projectName === "string"
      ? [
          {
            test: {
              project: run.projectName,
              file,
              declaredIn,
              titles: [...describes, title],
            },
            durationMs: totalDurationMs(run.results),
          },
        ]
      : [],
  );
}

function totalDurationMs(results: unknown): number | undefined {
  const attempts = listOf(results);
  if (attempts.length === 0) {
    return undefined;
  }
  return attempts.reduce<number>(
    (total, result) =>
      total +
      (isRecord(result) && typeof result.duration === "number"
        ? result.duration
        : 0),
    0,
  );
}

export function shardTestList(
  tests: readonly ListedTest[],
  timings: Timings,
  shard: Shard,
): string[] {
  return testListOf(shardUnits(tests, timings, shard));
}

export function shardTests(
  tests: readonly ListedTest[],
  timings: Timings,
  shard: Shard,
): ListedTest[] {
  return shardUnits(tests, timings, shard).flatMap((unit) => unit.tests);
}

export function testListMismatch(
  assigned: readonly ListedTest[],
  listed: readonly ListedTest[],
): TestListMismatch {
  return {
    missing: withoutTestsIn(assigned, listed),
    extra: withoutTestsIn(listed, assigned),
  };
}

function withoutTestsIn(
  tests: readonly ListedTest[],
  others: readonly ListedTest[],
): ListedTest[] {
  const otherIds = new Set(others.map(testId));
  return tests.filter((test) => !otherIds.has(testId(test)));
}

function testId(test: ListedTest): string {
  return JSON.stringify([test.project, test.file, ...test.titles]);
}

function shardUnits(
  tests: readonly ListedTest[],
  timings: Timings,
  shard: Shard,
): Unit[] {
  if (tests.some((test) => test.project === LOAD_ONLY_PROJECT)) {
    throw new Error(
      `A project named ${JSON.stringify(LOAD_ONLY_PROJECT)} would run from the lines that only load a spec file`,
    );
  }
  const units = unitsOf(tests, timings);
  if (units.length < shard.total) {
    throw new Error(
      `Cannot share ${String(units.length)} test list lines across ${String(shard.total)} shards`,
    );
  }
  const bins = Array.from({ length: shard.total }, (): Bin => ({
    units: [],
    durationMs: 0,
  }));
  for (const unit of units.toSorted(longestFirst)) {
    const lightest = bins.reduce((least, bin) =>
      bin.durationMs < least.durationMs ? bin : least,
    );
    lightest.units.push(unit);
    lightest.durationMs += unit.durationMs;
  }
  return bins[shard.current - 1]?.units ?? [];
}

/** Playwright loads only the spec files a test list names and matches each test by the file that declares it, so a test declared in a helper needs a line naming its spec file that matches no project. */
function testListOf(units: readonly Unit[]): string[] {
  const specFiles = new Set(units.flatMap((unit) => [...unit.specFiles]));
  return [
    ...units.map((unit) => unit.line),
    ...[...specFiles]
      .toSorted()
      .map((file) => [`[${LOAD_ONLY_PROJECT}]`, file].join(TITLE_SEPARATOR)),
  ];
}

function longestFirst(a: Unit, b: Unit): number {
  return b.durationMs - a.durationMs || (a.line < b.line ? -1 : 1);
}

/** Playwright reads a `--test-list` file line by line and splits a line holding `›` on `›` alone, trimming each part, so a title holding `\n` or `›`, or padded with spaces, cannot be named on its own line. */
function isWritableInTestList(title: string): boolean {
  return (
    title !== "" && title === title.trim() && !TEST_LIST_SEPARATORS.test(title)
  );
}

function lineNaming(test: ListedTest, titles: readonly string[]): string {
  return [`[${test.project}]`, test.declaredIn, ...titles].join(
    TITLE_SEPARATOR,
  );
}

function writableLine(test: ListedTest): string {
  const unwritable = test.titles.findIndex(
    (title) => !isWritableInTestList(title),
  );
  return lineNaming(
    test,
    unwritable === -1 ? test.titles : test.titles.slice(0, unwritable),
  );
}

function prefixLines(test: ListedTest): string[] {
  return Array.from({ length: test.titles.length + 1 }, (_, length) =>
    lineNaming(test, test.titles.slice(0, length)),
  );
}

function unitsOf(tests: readonly ListedTest[], timings: Timings): Unit[] {
  const lines = new Set(tests.map(writableLine));
  const fallbackMs =
    median(Object.values(timings).flatMap(Object.values)) ??
    DURATION_WITHOUT_TIMINGS_MS;
  const units = new Map<
    string,
    { tests: ListedTest[]; specFiles: Set<string>; durationMs: number }
  >();
  for (const test of tests) {
    const line = prefixLines(test).find((prefix) => lines.has(prefix));
    if (line === undefined) {
      throw new Error(`No test list line covers ${testPath(test)}`);
    }
    const unit = units.get(line) ?? {
      tests: [],
      specFiles: new Set(),
      durationMs: 0,
    };
    unit.tests.push(test);
    if (test.declaredIn !== test.file) {
      unit.specFiles.add(test.file);
    }
    unit.durationMs += timings[testPath(test)]?.[test.project] ?? fallbackMs;
    units.set(line, unit);
  }
  return [...units].map(([line, unit]) => ({ line, ...unit }));
}

function median(values: readonly number[]): number | undefined {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  const lower = sorted[sorted.length % 2 === 0 ? middle - 1 : middle];
  return upper === undefined || lower === undefined
    ? undefined
    : (upper + lower) / 2;
}
