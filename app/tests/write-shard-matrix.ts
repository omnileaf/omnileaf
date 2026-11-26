import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import timings from "./browser-timings.json" with { type: "json" };
import { screensFromEnvironment } from "./screens.ts";
import {
  browserSuiteFromEnvironment,
  type TestListSize,
  shardMatrix,
} from "./shard-matrix.ts";
import {
  listedTests,
  testListSize,
  testsOnScreens,
} from "./shard-test-list.ts";

const {
  positionals: [listings],
} = parseArgs({ allowPositionals: true });

if (listings === undefined) {
  throw new Error(
    "Usage: node tests/write-shard-matrix.ts <folder of the groups' playwright --list json>",
  );
}

function flagFromEnvironment(name: string): boolean {
  const value = process.env[name];
  if (value !== "true" && value !== "false") {
    throw new Error(
      `${name} must be true or false, got ${JSON.stringify(value)}`,
    );
  }
  return value === "true";
}

const screens = screensFromEnvironment(process.env.PLAYWRIGHT_SCREENS);
const suite = browserSuiteFromEnvironment(process.env.BROWSER_SUITE);
const isAppChanged = flagFromEnvironment("IS_APP_CHANGED");

function sizeOfGroup(
  listingsFolder: string,
  group: "rest" | "screens",
): TestListSize {
  if (suite === "whole" || !isAppChanged) {
    return { lines: 0, durationMs: 0 };
  }
  const report: unknown = JSON.parse(
    readFileSync(join(listingsFolder, `${group}.json`), "utf8"),
  );
  return testListSize(testsOnScreens(listedTests(report), screens), timings);
}

const matrix = shardMatrix({
  isAppChanged,
  isSiteChanged: flagFromEnvironment("IS_SITE_CHANGED"),
  suite,
  screens,
  touched: {
    rest: sizeOfGroup(listings, "rest"),
    screens: sizeOfGroup(listings, "screens"),
  },
});
console.log(JSON.stringify(matrix));
