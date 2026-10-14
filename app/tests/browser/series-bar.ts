import type { Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

export async function settleBarTitle(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bar = document.querySelector("main header");
        const shown = bar?.querySelector("span[aria-hidden=true]");
        const title = document.querySelector("main h1");
        if (bar === null || !shown || title === null) {
          return true;
        }
        const isUnder =
          title.getBoundingClientRect().bottom <=
          bar.getBoundingClientRect().bottom;
        return getComputedStyle(shown).opacity === (isUnder ? "1" : "0");
      }),
    )
    .toBe(true);
}
