import { expect, test } from "vitest";

import { type FirstLaunchStep, numberOf, stepAfter } from "./steps";

function stepsFrom(step: FirstLaunchStep): FirstLaunchStep[] {
  const next = stepAfter(step);
  return next === undefined ? [step] : [step, ...stepsFrom(next)];
}

test("goes from the welcome through each step to the ready one", () => {
  const steps = stepsFrom("welcome");

  expect(steps).toEqual(["welcome", "home", "ready"]);
});

test("numbers the steps between the welcome and the ready one", () => {
  const numbers = stepsFrom("welcome").map(numberOf);

  expect(numbers).toEqual([undefined, { number: 1, count: 1 }, undefined]);
});
