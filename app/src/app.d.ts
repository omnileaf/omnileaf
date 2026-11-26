import type { FirstLaunchStep } from "#lib/first-launch/steps.ts";
import type { OriginPage } from "#lib/reader/reader-way-back.ts";

declare global {
  interface ImportMetaEnv {
    readonly VITE_SAMPLE_LIBRARY?: string;
    readonly VITE_KIT_PAGE?: string;
    readonly VITE_BUILD_DATE?: string;
  }

  namespace App {
    interface PageState {
      firstLaunchStep?: FirstLaunchStep;
      folderGuide?: boolean;
      readerOpensAtEnd?: boolean;
      readerJumped?: boolean;
      readerOrigin?: OriginPage | null;
      libraryTag?: string;
    }
  }
}

export {};
