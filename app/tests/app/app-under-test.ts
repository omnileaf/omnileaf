import type { Capabilities } from "./webdriver.ts";

export interface AppUnderTest {
  readonly server: string;
  readonly capabilities: Capabilities;
  readonly simulatorWindowApp?: string;
}

declare module "vitest" {
  interface ProvidedContext {
    appUnderTest: AppUnderTest;
    /** The generated library desktop specs link, which only the desktop launch provides. */
    sampleLibraryFolder: string;
  }
}
