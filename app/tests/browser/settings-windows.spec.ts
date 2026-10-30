import type { Locator } from "@playwright/test";

import {
  EXPANDED_MIN_WIDTH,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";

const LAYER_CORNER = "8px";
const INDICATOR = { width: 3, height: 16, offsetFromRowCentre: 0 };

function indicatorOf(link: Locator) {
  return link.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    const height = parseFloat(style.blockSize);
    const top =
      parseFloat(style.insetBlockStart) + parseFloat(style.marginBlockStart);
    return {
      width: parseFloat(style.inlineSize),
      height,
      colour: style.backgroundColor,
      offsetFromRowCentre: top + height / 2 - element.clientHeight / 2,
    };
  });
}

test.describe("on Windows", () => {
  testOnlyInItsWebview("windows");
  test.use(onPlatform("windows"));

  test("sets the shell on Mica and the page on a layer with a rounded corner", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < EXPANDED_MIN_WIDTH,
      "the desktop shell from 840px",
    );
    await page.goto("/settings/general");
    const main = page.getByRole("main");
    await expect(main).toBeVisible();

    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCSS(
      "background-color",
      await tokenColour(page, "--windows-mica"),
    );
    await expect(main).toHaveCSS(
      "background-color",
      await tokenColour(page, "--windows-layer-solid"),
    );
    await expect(main).toHaveCSS("border-start-start-radius", LAYER_CORNER);
  });

  test("marks the open page in both navigations with a short accent bar", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < EXPANDED_MIN_WIDTH,
      "the Settings nav shows beside the page from 840px",
    );
    await page.goto("/settings/general");
    const accent = await tokenColour(page, "--color-accent");

    for (const link of [
      page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Settings" }),
      page
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("link", { name: "General" }),
    ]) {
      await expect(link).toBeVisible();
      expect(await indicatorOf(link)).toEqual({ ...INDICATOR, colour: accent });
    }
  });
});
