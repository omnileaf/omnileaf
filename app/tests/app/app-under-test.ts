import { inject } from "vitest";

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

export function capability(name: string): string {
  const value = inject("appUnderTest").capabilities[name];
  if (typeof value !== "string") {
    throw new Error(`the app session has no ${name}`);
  }
  return value;
}
