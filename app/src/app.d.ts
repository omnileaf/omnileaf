import type { FirstLaunchStep } from "$lib/first-launch/steps";

declare global {
  namespace App {
    interface PageState {
      firstLaunchStep?: FirstLaunchStep;
    }
  }
}

export {};
