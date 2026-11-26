import { expect, test } from "vitest";

import {
  browserSuiteFromEnvironment,
  type ShardJob,
  type ShardPlan,
  shardCounts,
  shardMatrix,
  TARGET_SHARD_MS,
} from "../shard-matrix.ts";

const NO_TOUCHED_TESTS = {
  rest: { lines: 0, durationMs: 0 },
  screens: { lines: 0, durationMs: 0 },
};

const WHOLE_APP: ShardPlan = {
  isAppChanged: true,
  isSiteChanged: false,
  suite: "whole",
  screens: null,
  touched: NO_TOUCHED_TESTS,
};

function countOf(matrix: readonly ShardJob[], group: string): number {
  return matrix.filter((job) => job.group === group).length;
}

test("runs the whole suite when no suite is named", () => {
  expect(browserSuiteFromEnvironment(undefined)).toBe("whole");
});

test.each(["whole", "touched"] as const)("reads the %s suite", (suite) => {
  expect(browserSuiteFromEnvironment(suite)).toBe(suite);
});

test.each(["", "all", "Touched"])(
  "rejects %j, which names no suite",
  (value) => {
    expect(() => browserSuiteFromEnvironment(value)).toThrow(
      JSON.stringify(value),
    );
  },
);

test("uses 36 rest shards and 12 screens shards on every screen", () => {
  expect(shardCounts(null)).toEqual({ rest: 36, screens: 12 });
});

test("uses 24 rest shards and 8 screens shards on the phone and the desktop", () => {
  expect(shardCounts(["phone", "desktop"])).toEqual({ rest: 24, screens: 8 });
});

test("scales the shards with the number of screens", () => {
  expect(shardCounts(["tablet"])).toEqual({ rest: 12, screens: 4 });
});

test("shares the whole suite out across every shard, with the speed timing alone", () => {
  const matrix = shardMatrix(WHOLE_APP);

  expect([
    countOf(matrix, "rest"),
    countOf(matrix, "screens"),
    countOf(matrix, "speed"),
    countOf(matrix, "site"),
  ]).toEqual([36, 12, 1, 0]);
});

test("shares the whole suite out across fewer shards on fewer screens", () => {
  const matrix = shardMatrix({ ...WHOLE_APP, screens: ["phone", "desktop"] });

  expect([countOf(matrix, "rest"), countOf(matrix, "screens")]).toEqual([
    24, 8,
  ]);
});

test("numbers each group's shards from 1 to its size", () => {
  const matrix = shardMatrix({ ...WHOLE_APP, screens: ["desktop"] });

  expect(matrix.filter((job) => job.group === "screens")).toEqual([
    { group: "screens", shard: 1, of: 4 },
    { group: "screens", shard: 2, of: 4 },
    { group: "screens", shard: 3, of: 4 },
    { group: "screens", shard: 4, of: 4 },
  ]);
});

test("adds the website's tests when the website changed", () => {
  const matrix = shardMatrix({ ...WHOLE_APP, isSiteChanged: true });

  expect(matrix.filter((job) => job.group === "site")).toEqual([
    { group: "site", shard: 1, of: 1 },
  ]);
});

test("runs only the website's tests when only the website changed", () => {
  const matrix = shardMatrix({
    ...WHOLE_APP,
    isAppChanged: false,
    isSiteChanged: true,
  });

  expect(matrix).toEqual([{ group: "site", shard: 1, of: 1 }]);
});

test("runs no shard when neither the app nor the website changed", () => {
  const matrix = shardMatrix({ ...WHOLE_APP, isAppChanged: false });

  expect(matrix).toEqual([]);
});

const TOUCHED_APP: ShardPlan = { ...WHOLE_APP, suite: "touched" };

test("runs no shard when a pull request under another touches no test", () => {
  const matrix = shardMatrix(TOUCHED_APP);

  expect(matrix).toEqual([]);
});

test("runs a short list of touched tests on one shard, without the speed timing", () => {
  const matrix = shardMatrix({
    ...TOUCHED_APP,
    touched: {
      rest: { lines: 12, durationMs: 90_000 },
      screens: { lines: 0, durationMs: 0 },
    },
  });

  expect(matrix).toEqual([{ group: "rest", shard: 1, of: 1 }]);
});

test("adds a shard for each target's worth of touched tests", () => {
  const matrix = shardMatrix({
    ...TOUCHED_APP,
    touched: {
      rest: { lines: 400, durationMs: 2.5 * TARGET_SHARD_MS },
      screens: { lines: 30, durationMs: TARGET_SHARD_MS },
    },
  });

  expect([countOf(matrix, "rest"), countOf(matrix, "screens")]).toEqual([3, 1]);
});

test("never uses more shards than the whole suite does", () => {
  const matrix = shardMatrix({
    ...TOUCHED_APP,
    screens: ["phone", "desktop"],
    touched: {
      rest: { lines: 5000, durationMs: 400 * TARGET_SHARD_MS },
      screens: { lines: 5000, durationMs: 400 * TARGET_SHARD_MS },
    },
  });

  expect([countOf(matrix, "rest"), countOf(matrix, "screens")]).toEqual([
    24, 8,
  ]);
});

test("never uses more shards than there are test list lines to share out", () => {
  const matrix = shardMatrix({
    ...TOUCHED_APP,
    touched: {
      rest: { lines: 2, durationMs: 50 * TARGET_SHARD_MS },
      screens: { lines: 0, durationMs: 0 },
    },
  });

  expect(countOf(matrix, "rest")).toBe(2);
});

test("adds the website's tests to the touched ones", () => {
  const matrix = shardMatrix({
    ...TOUCHED_APP,
    isSiteChanged: true,
    touched: {
      rest: { lines: 1, durationMs: 1000 },
      screens: { lines: 0, durationMs: 0 },
    },
  });

  expect(matrix).toEqual([
    { group: "rest", shard: 1, of: 1 },
    { group: "site", shard: 1, of: 1 },
  ]);
});
