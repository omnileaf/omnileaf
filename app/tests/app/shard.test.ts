import { expect, test } from "vitest";

import { shardFromEnvironment } from "../shard.ts";

test("runs the whole suite when no shard is set", () => {
  expect(shardFromEnvironment(undefined)).toBeNull();
});

test("picks the shard from current/total", () => {
  expect(shardFromEnvironment("2/3")).toEqual({ current: 2, total: 3 });
});

test("rejects a shard past the total", () => {
  expect(() => shardFromEnvironment("4/3")).toThrow('"4/3"');
});

test("rejects an empty total", () => {
  expect(() => shardFromEnvironment("1/0")).toThrow('"1/0"');
});

test.each(["", "3", "0/3", "1.5/3", "a/b", "1/2/3"])(
  "rejects %j, which is not two whole numbers",
  (value) => {
    expect(() => shardFromEnvironment(value)).toThrow(JSON.stringify(value));
  },
);
