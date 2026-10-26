import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import timings from "./browser-timings.json" with { type: "json" };
import { shardFromEnvironment } from "./shard.ts";
import {
  type ListedTest,
  listedTests,
  shardTests,
  testListMismatch,
  testPath,
} from "./shard-test-list.ts";

const {
  positionals: [groupListing, shardValue, shardListing],
} = parseArgs({ allowPositionals: true });

if (groupListing === undefined || shardListing === undefined) {
  throw new Error(
    "Usage: node tests/check-shard-test-list.ts <group's playwright --list json> <current/total> <shard's playwright --list --test-list json>",
  );
}
const shard = shardFromEnvironment(shardValue);
if (shard === null) {
  throw new Error("Name the shard as current/total");
}

function testsListedIn(file: string): ListedTest[] {
  return listedTests(JSON.parse(readFileSync(file, "utf8")));
}

function nameOf(test: ListedTest): string {
  return `[${test.project}] ${testPath(test)}`;
}

const assigned = shardTests(testsListedIn(groupListing), timings, shard);
const { missing, extra } = testListMismatch(
  assigned,
  testsListedIn(shardListing),
);
const shardName = `${String(shard.current)}/${String(shard.total)}`;

for (const test of missing) {
  console.error(
    `Shard ${shardName} was given ${nameOf(test)}, which its test list does not run`,
  );
}
for (const test of extra) {
  console.error(
    `Shard ${shardName} was not given ${nameOf(test)}, which its test list runs`,
  );
}
if (missing.length > 0 || extra.length > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `The test list of shard ${shardName} runs exactly the ${String(assigned.length)} tests it was given`,
  );
}
