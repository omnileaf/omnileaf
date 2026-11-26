import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { flakyAnnotations, flakySummary, flakyTests } from "./flaky-tests.ts";
import { setStepOutput, writeStepSummary } from "./github-output.ts";

const {
  positionals: [reportFile, specFolder, shard, output],
} = parseArgs({ allowPositionals: true });

if (
  reportFile === undefined ||
  specFolder === undefined ||
  shard === undefined ||
  output === undefined
) {
  throw new Error(
    "Usage: node tests/report-flaky-tests.ts <playwright json report> <spec folder from the repository root> <shard name> <flaky tests file>",
  );
}

const report: unknown = JSON.parse(readFileSync(reportFile, "utf8"));
const flaky = flakyTests(report, specFolder, shard);

for (const annotation of flakyAnnotations(flaky)) {
  console.log(annotation);
}
if (flaky.length > 0) {
  writeFileSync(output, JSON.stringify(flaky));
  writeStepSummary(process.env, flakySummary(flaky));
}
setStepOutput(process.env, "flaky", String(flaky.length > 0));
console.log(`Shard ${shard} had ${String(flaky.length)} flaky tests`);
