import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import kept from "./browser-timings.json" with { type: "json" };
import { mergeTimings, testDurations } from "./shard-test-list.ts";

const TIMINGS = new URL("browser-timings.json", import.meta.url);
const NARROWING_VARIABLES = ["PLAYWRIGHT_GROUP", "PLAYWRIGHT_SHARD"];
const playwrightArguments = process.argv.slice(2);
const isNarrowed =
  playwrightArguments.length > 0 ||
  NARROWING_VARIABLES.some((name) => process.env[name] !== undefined);
const report = join(
  mkdtempSync(join(tmpdir(), "omnileaf-timings-")),
  "report.json",
);

const run = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", "--reporter=dot,json", ...playwrightArguments],
  {
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

const measured = testDurations(JSON.parse(readFileSync(report, "utf8")));
const durations = isNarrowed ? mergeTimings(kept, measured) : measured;
const entries = Object.entries(durations)
  .toSorted(([a], [b]) => (a < b ? -1 : 1))
  .map(
    ([path, byProject]) =>
      `  ${JSON.stringify(path)}: ${JSON.stringify(byProject)}`,
  );
writeFileSync(TIMINGS, `{\n${entries.join(",\n")}\n}\n`);
console.log(`Kept the timings of ${String(entries.length)} tests`);
process.exitCode = run.status ?? 1;
