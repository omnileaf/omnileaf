import { expect, test } from "vitest";

import {
  DEFAULT_PREVIEW_PORT,
  previewPortFromEnvironment,
} from "../preview-port.ts";

test("serves the browser tests on the usual port when none is set", () => {
  expect(previewPortFromEnvironment(undefined)).toBe(DEFAULT_PREVIEW_PORT);
});

test("serves them on the port a worktree asks for", () => {
  expect(previewPortFromEnvironment("4183")).toBe(4183);
});

test.each(["", "0", "80", "1023", "65536", "41.5", "port", "-4173", "4173 "])(
  "rejects %j, which is not a port a test run can take",
  (value) => {
    expect(() => previewPortFromEnvironment(value)).toThrow(
      JSON.stringify(value),
    );
  },
);
