import { expect, test } from "vitest";

import { startingStyleProblems } from "./starting-style.ts";

test("passes a starting: class with its data-starting-style: twin", () => {
  expect(
    startingStyleProblems(
      `class="motion-sheets:starting:translate-y-full motion-sheets:data-starting-style:translate-y-full"`,
    ),
  ).toEqual([]);
});

test("names a starting: class that has no data-starting-style: twin", () => {
  expect(
    startingStyleProblems(
      `class="fixed motion-sheets:starting:translate-y-full"`,
    ),
  ).toEqual([
    "motion-sheets:starting:translate-y-full needs motion-sheets:data-starting-style:translate-y-full beside it",
  ]);
});

test("passes a data-starting-style: class on its own", () => {
  expect(
    startingStyleProblems(`class="data-starting-style:opacity-0"`),
  ).toEqual([]);
});

test("passes an @starting-style block whose rule also styles [data-starting-style]", () => {
  expect(
    startingStyleProblems(`@utility fade {
  transition-property: opacity;
  @starting-style {
    opacity: 0;
  }
  &[data-starting-style] {
    opacity: 0;
  }
}`),
  ).toEqual([]);
});

test("names an @starting-style block whose rule never styles [data-starting-style]", () => {
  expect(
    startingStyleProblems(`.toast {
  transition-property: translate;
  @starting-style {
    translate: 0 100%;
  }
}
.other {
  &[data-starting-style] {
    opacity: 0;
  }
}`),
  ).toEqual([
    "@starting-style in .toast needs a [data-starting-style] rule beside it",
  ]);
});
