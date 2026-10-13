import { type Locator, xpath } from "./webdriver.ts";

export function segmentedOption(within: string, label: string): Locator {
  return xpath(
    `${within}//*[@role='radio'][.//span[not(@aria-hidden='true')][normalize-space()='${label}']]`,
  );
}
