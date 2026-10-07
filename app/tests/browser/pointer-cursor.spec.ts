import type { Locator } from "@playwright/test";

import {
  addFolderBesideFolders,
  CONTROLS,
  DESKTOP,
  WITH_THE_PICKER_OPEN,
} from "./controls.ts";
import { expect, test } from "./fixtures.ts";

function cursorOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).cursor);
}

test.use({ backend: DESKTOP });
test.skip(({ isMobile }) => isMobile, "pointer screens only");

for (const { name, path, find } of CONTROLS) {
  test(`shows a pointer over ${name}`, async ({ page }) => {
    await page.goto(path);
    const control = find(page);

    await control.hover();

    expect(await cursorOf(control)).toBe("pointer");
  });
}

test.describe("while the folder picker is open", () => {
  test.use({ backend: WITH_THE_PICKER_OPEN });

  test("keeps the default cursor over the disabled button", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    const button = addFolderBesideFolders(page);

    await button.click();
    await expect(button).toBeDisabled();

    expect(await cursorOf(button)).toBe("default");
  });
});
