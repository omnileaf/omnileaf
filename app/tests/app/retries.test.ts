import { expect, test } from "vitest";

import { retriesFromEnvironment } from "../retries.ts";

test.each(["pull_request", "push"])(
  "retries a failed test once in CI on a %s",
  (event) => {
    expect(
      retriesFromEnvironment({ CI: "true", GITHUB_EVENT_NAME: event }),
    ).toBe(1);
  },
);

test.each(["schedule", "merge_group", "workflow_dispatch"])(
  "never retries in CI on a %s, so a flaky test still fails somewhere",
  (event) => {
    expect(
      retriesFromEnvironment({ CI: "true", GITHUB_EVENT_NAME: event }),
    ).toBe(0);
  },
);

test("never retries outside CI, whatever event the shell names", () => {
  expect(retriesFromEnvironment({ GITHUB_EVENT_NAME: "push" })).toBe(0);
});

test("never retries in CI when no event is named", () => {
  expect(retriesFromEnvironment({ CI: "true" })).toBe(0);
});
