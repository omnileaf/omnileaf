export const FIRST_LAUNCH_STEPS = ["welcome", "ready"] as const;

export type FirstLaunchStep = (typeof FIRST_LAUNCH_STEPS)[number];

export function stepAfter(step: FirstLaunchStep): FirstLaunchStep | undefined {
  return FIRST_LAUNCH_STEPS[FIRST_LAUNCH_STEPS.indexOf(step) + 1];
}
