import type { Capabilities } from "./webdriver.ts";

export interface AppUnderTest {
  readonly server: string;
  readonly capabilities: Capabilities;
}

declare module "vitest" {
  interface ProvidedContext {
    appUnderTest: AppUnderTest;
  }
}
