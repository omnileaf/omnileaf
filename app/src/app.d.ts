import type { FirstLaunchStep } from "#lib/first-launch/steps.ts";

declare global {
  interface ImportMetaEnv {
    readonly VITE_SAMPLE_LIBRARY?: string;
    readonly VITE_KIT_PAGE?: string;
  }

  namespace App {
    interface PageState {
      firstLaunchStep?: FirstLaunchStep;
      readerOpensAtEnd?: boolean;
      readerJumped?: boolean;
    }
  }
}

export {};
