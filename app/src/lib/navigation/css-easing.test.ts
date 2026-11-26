import { expect, test } from "vitest";

import { cssLinearEasing } from "./css-easing";

test("writes a curve as evenly spaced CSS linear() stops", () => {
  expect(cssLinearEasing((x) => x * x, 4)).toBe(
    "linear(0, 0.0625, 0.25, 0.5625, 1)",
  );
});
