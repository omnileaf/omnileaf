import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { testDurations } from "./shard-test-list.ts";

const TIMINGS = new URL("browser-timings.json", import.meta.url);
const report = join(
  mkdtempSync(join(tmpdir(), "omnileaf-timings-")),
  "report.json",
);

const run = spawnSync(
  "pnpm",
  [
    "exec",
    "playwright",
    "test",
    "--reporter=dot,json",
    ...process.argv.slice(2),
  ],
  {
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

const durations = testDurations(JSON.parse(readFileSync(report, "utf8")));
const entries = Object.entries(durations)
  .toSorted(([a], [b]) => (a < b ? -1 : 1))
  .map(
    ([path, byProject]) =>
      `  ${JSON.stringify(path)}: ${JSON.stringify(byProject)}`,
  );
writeFileSync(TIMINGS, `{\n${entries.join(",\n")}\n}\n`);
console.log(`Kept the timings of ${String(entries.length)} tests`);
process.exitCode = run.status ?? 1;
