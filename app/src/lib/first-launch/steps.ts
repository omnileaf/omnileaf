export const NUMBERED_STEPS = ["home", "link", "choices"] as const;

export const FIRST_LAUNCH_STEPS = [
  "welcome",
  ...NUMBERED_STEPS,
  "ready",
] as const;

export type FirstLaunchStep = (typeof FIRST_LAUNCH_STEPS)[number];

export type NumberedStep = (typeof NUMBERED_STEPS)[number];

export interface StepNumber {
  readonly number: number;
  readonly count: number;
}

export function stepAfter(step: FirstLaunchStep): FirstLaunchStep | undefined {
  return FIRST_LAUNCH_STEPS[FIRST_LAUNCH_STEPS.indexOf(step) + 1];
}

export function numberOf(step: FirstLaunchStep): StepNumber | undefined {
  const index = NUMBERED_STEPS.findIndex((numbered) => numbered === step);
  return index === -1
    ? undefined
    : { number: index + 1, count: NUMBERED_STEPS.length };
}
