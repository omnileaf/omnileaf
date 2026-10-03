export const FIRST_LAUNCH_STEPS = [
  "welcome",
  "home",
  "choices",
  "ready",
] as const;

export type FirstLaunchStep = (typeof FIRST_LAUNCH_STEPS)[number];

export interface StepNumber {
  readonly number: number;
  readonly count: number;
}

const NUMBERED_STEPS = FIRST_LAUNCH_STEPS.slice(1, -1);

export function stepAfter(step: FirstLaunchStep): FirstLaunchStep | undefined {
  return FIRST_LAUNCH_STEPS[FIRST_LAUNCH_STEPS.indexOf(step) + 1];
}

/** The welcome and the ready step frame the others, so only the steps between them are counted. */
export function numberOf(step: FirstLaunchStep): StepNumber | undefined {
  const index = NUMBERED_STEPS.indexOf(step);
  return index === -1
    ? undefined
    : { number: index + 1, count: NUMBERED_STEPS.length };
}
