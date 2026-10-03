import { expect, test } from "vitest";

import { type FirstLaunchStep, stepAfter } from "./steps";

function stepsFrom(step: FirstLaunchStep): FirstLaunchStep[] {
  const next = stepAfter(step);
  return next === undefined ? [step] : [step, ...stepsFrom(next)];
}

test("goes from the welcome through each step to the ready one", () => {
  const steps = stepsFrom("welcome");

  expect(steps).toEqual(["welcome", "ready"]);
});
