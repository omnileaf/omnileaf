import type { FirstLaunchStep } from "#lib/first-launch/steps.ts";

declare global {
  namespace App {
    interface PageState {
      firstLaunchStep?: FirstLaunchStep;
    }
  }
}

export {};
