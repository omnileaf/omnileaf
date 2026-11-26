import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { isRecord, listOf } from "./app/json.ts";

export interface FlakyTest {
  readonly shard: string;
  readonly project: string;
  readonly file: string;
  readonly line: number;
  readonly title: string;
}

interface Scope {
  readonly specFolder: string;
  readonly shard: string;
  readonly describes: readonly string[];
}

export const FLAKY_TESTS_FILE = "flaky-tests.json";

const FLAKY = "flaky";
const TITLE_SEPARATOR = " › ";
const ANNOTATION_TITLE = "Flaky browser test";

export function flakyTests(
  report: unknown,
  specFolder: string,
  shard: string,
): FlakyTest[] {
  if (!isRecord(report) || !Array.isArray(report.suites)) {
    throw new Error("Expected a Playwright JSON report with suites");
  }
  return report.suites.flatMap((suite) =>
    flakyInSuite(suite, { specFolder, shard, describes: [] }),
  );
}

function flakyInSuite(suite: unknown, scope: Scope): FlakyTest[] {
  if (!isRecord(suite)) {
    return [];
  }
  const specs = listOf(suite.specs).flatMap((spec) => flakyInSpec(spec, scope));
  const nested = listOf(suite.suites).flatMap((child) =>
    flakyInSuite(child, {
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

function flakyInSpec(spec: unknown, scope: Scope): FlakyTest[] {
  if (
    !isRecord(spec) ||
    typeof spec.title !== "string" ||
    typeof spec.file !== "string" ||
    typeof spec.line !== "number"
  ) {
    return [];
  }
  const { title, file, line } = spec;
  return listOf(spec.tests).flatMap((run) =>
    isRecord(run) && run.status === FLAKY && typeof run.projectName === "string"
      ? [
          {
            shard: scope.shard,
            project: run.projectName,
            file: `${scope.specFolder}/${file}`,
            line,
            title: [...scope.describes, title].join(TITLE_SEPARATOR),
          },
        ]
      : [],
  );
}

function escapedData(value: string): string {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function escapedProperty(value: string): string {
  return escapedData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

export function flakyAnnotations(tests: readonly FlakyTest[]): string[] {
  return tests.map((test) => {
    const properties = [
      `file=${escapedProperty(test.file)}`,
      `line=${String(test.line)}`,
      `title=${escapedProperty(ANNOTATION_TITLE)}`,
    ].join(",");
    const message = escapedData(
      `[${test.project}] ${test.title} passed only on its retry in shard ${test.shard}`,
    );
    return `::warning ${properties}::${message}`;
  });
}

function tableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll(/\s*\n\s*/gu, " ");
}

export function flakySummary(tests: readonly FlakyTest[]): string {
  if (tests.length === 0) {
    return "";
  }
  const rows = tests.map(
    (test) =>
      `| ${[
        test.shard,
        test.project,
        test.title,
        `${test.file}:${String(test.line)}`,
      ]
        .map(tableCell)
        .join(" | ")} |`,
  );
  return [
    "### Flaky browser tests",
    "",
    "These passed only on their retry. A first-failure trace is in the shard's traces artifact.",
    "",
    "| Shard | Project | Test | Declared at |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

export function flakyTestsInFolder(folder: string): FlakyTest[] {
  if (!existsSync(folder)) {
    return [];
  }
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((path) => basename(path) === FLAKY_TESTS_FILE)
    .toSorted()
    .flatMap((path) => {
      const content: unknown = JSON.parse(
        readFileSync(join(folder, path), "utf8"),
      );
      return listOf(content).map(flakyTestOf);
    });
}

function flakyTestOf(value: unknown): FlakyTest {
  if (
    !isRecord(value) ||
    typeof value.shard !== "string" ||
    typeof value.project !== "string" ||
    typeof value.file !== "string" ||
    typeof value.line !== "number" ||
    typeof value.title !== "string"
  ) {
    throw new Error(`Not a flaky test: ${JSON.stringify(value)}`);
  }
  const { shard, project, file, line, title } = value;
  return { shard, project, file, line, title };
}
