import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import timings from "./browser-timings.json" with { type: "json" };
import { screensFromEnvironment } from "./screens.ts";
import { shardFromEnvironment } from "./shard.ts";
import {
  listedTests,
  shardTestList,
  testsOnScreens,
} from "./shard-test-list.ts";

const {
  positionals: [listing, shardValue, output],
} = parseArgs({ allowPositionals: true });

if (listing === undefined || output === undefined) {
  throw new Error(
    "Usage: node tests/write-shard-test-list.ts <playwright --list json> <current/total> <test list file>",
  );
}
const shard = shardFromEnvironment(shardValue);
if (shard === null) {
  throw new Error("Name the shard as current/total");
}

const report: unknown = JSON.parse(readFileSync(listing, "utf8"));
const screens = screensFromEnvironment(process.env.PLAYWRIGHT_SCREENS);
const lines = shardTestList(
  testsOnScreens(listedTests(report), screens),
  timings,
  shard,
);
writeFileSync(output, `${lines.join("\n")}\n`);
console.log(
  `Wrote ${String(lines.length)} test list lines for shard ${String(shard.current)}/${String(shard.total)}`,
);
