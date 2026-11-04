import { expect, test } from "vitest";

import { WRAPPING_LABEL } from "./wrapping-label.ts";

const TOKENS = WRAPPING_LABEL.split(/\s+/);

test("lets a label wrap inside the button instead of running past its edges", () => {
  expect(TOKENS).toEqual(
    expect.arrayContaining([
      "whitespace-normal",
      "min-inline-0",
      "text-center",
    ]),
  );
});

test("lets the button grow taller than its minimum when the label wraps", () => {
  expect(TOKENS).toEqual(
    expect.arrayContaining(["block-auto", "tablet:block-auto"]),
  );
});

test("keeps 44 pixels on a phone and 36 from the tablet width, with room above and below a wrapped label", () => {
  expect(TOKENS).toEqual(
    expect.arrayContaining([
      "min-block-11",
      "tablet:min-block-9",
      "py-2",
      "tablet:py-1.5",
    ]),
  );
});

test("breaks even a single long word rather than let it run past the button", () => {
  expect(TOKENS).toEqual(expect.arrayContaining(["wrap-anywhere"]));
});

test("keeps a button no wider than the space it is in", () => {
  expect(TOKENS).toEqual(expect.arrayContaining(["max-inline-full"]));
});
