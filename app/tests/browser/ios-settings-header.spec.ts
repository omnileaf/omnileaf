import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";

const BACK_BUTTON_PX = 44;
const TITLE_SIZE = "17px";
const TITLE_WEIGHT = "600";
const CENTRE_TOLERANCE_PX = 2;

test.use({ backend: DEFAULT_BACKEND });

test.describe("a pushed Settings page on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(async ({ page, platform }) => {
    test.skip(platform !== "ios", "iOS's glass back circle");
    await page.goto("/settings/library/tabs");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("puts the way back in a glass circle at the start of the bar", async ({
    page,
  }) => {
    const back = page.getByRole("link", { name: "Back to Library" });

    const box = await boxOf(back);
    expect(box.width).toBeCloseTo(BACK_BUTTON_PX, 0);
    expect(box.height).toBeCloseTo(BACK_BUTTON_PX, 0);
    await expect(back).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-bar-button"),
    );
    await expect(back).toHaveText("");
  });

  test("sets the title inline, centred in the bar beside the circle", async ({
    page,
  }) => {
    const title = page.getByRole("heading", { level: 1, name: "Library tabs" });
    const back = await boxOf(
      page.getByRole("link", { name: "Back to Library" }),
    );

    const box = await boxOf(title);
    await expect(title).toHaveCSS("font-size", TITLE_SIZE);
    await expect(title).toHaveCSS("font-weight", TITLE_WEIGHT);
    const middle = box.x + box.width / 2;
    expect(Math.abs(middle - viewportOf(page).width / 2)).toBeLessThan(
      CENTRE_TOLERANCE_PX,
    );
    expect(
      Math.abs(box.y + box.height / 2 - (back.y + back.height / 2)),
    ).toBeLessThan(CENTRE_TOLERANCE_PX);
  });

  test("still goes back to the page it came from", async ({ page }) => {
    await page.getByRole("link", { name: "Back to Library" }).click();

    await expect(page).toHaveURL(/\/settings\/library$/);
  });

  for (const route of [
    "library/tabs",
    "library/tags",
    "library/adult-content",
    "general",
  ]) {
    test(`lays /settings/${route} on the grouped ground`, async ({ page }) => {
      await page.goto(`/settings/${route}`);

      await expect(page.locator('[data-ground="grouped"]')).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-grouped-ground"),
      );
    });
  }
});
