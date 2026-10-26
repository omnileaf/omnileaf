import { expect, test } from "vitest";

import { testGroupFromEnvironment } from "../test-group.ts";

test("runs every test when no group is set", () => {
  expect(testGroupFromEnvironment(undefined)).toBeNull();
});

test.each(["screens", "rest"] as const)("runs the %s group", (group) => {
  expect(testGroupFromEnvironment(group)).toBe(group);
});

test.each(["", "screen", "Screens", "all"])(
  "rejects %j, which names no group",
  (value) => {
    expect(() => testGroupFromEnvironment(value)).toThrow(
      JSON.stringify(value),
    );
  },
);
