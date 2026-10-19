import { globSync, readFileSync } from "node:fs";

import { startingStyleProblems } from "./starting-style.ts";

const SOURCES = "src/**/*.{css,svelte,ts}";

const problems = globSync(SOURCES).flatMap((path) =>
  startingStyleProblems(readFileSync(path, "utf8")).map(
    (problem) => `${path}: ${problem}`,
  ),
);

for (const problem of problems) {
  console.error(problem);
}
process.exitCode = problems.length === 0 ? 0 : 1;
