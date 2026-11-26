import { parseArgs } from "node:util";

import { flakySummary, flakyTestsInFolder } from "./flaky-tests.ts";
import { writeStepSummary } from "./github-output.ts";

const {
  positionals: [folder],
} = parseArgs({ allowPositionals: true });

if (folder === undefined) {
  throw new Error(
    "Usage: node tests/summarise-flaky-tests.ts <folder of the shards' flaky test artifacts>",
  );
}

const flaky = flakyTestsInFolder(folder);
writeStepSummary(process.env, flakySummary(flaky));
console.log(`The run had ${String(flaky.length)} flaky tests`);
