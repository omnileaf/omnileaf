import { expect, test } from "vitest";

import { confirmationFor } from "#lib/copy-confirmation.ts";

test.each([
  [undefined, ""],
  ["copied", "Copied"],
  ["selected", "The text is selected. Copy it with the keyboard."],
] as const)("words %s as %j", (outcome, words) => {
  expect(confirmationFor(outcome)).toBe(words);
});
