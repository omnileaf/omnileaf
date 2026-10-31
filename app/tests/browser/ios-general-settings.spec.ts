import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const TOUCH_TARGET_PX = 48;

test.use({ backend: DEFAULT_BACKEND });

test.describe("General settings on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "ios", "iOS's pushed pickers");
  });

  test("lists Omnileaf opens on, Language and Time format as rows with their values", async ({
    page,
  }) => {
    await page.goto("/settings/general");

    const opens = page.getByRole("link", { name: /Omnileaf opens on/ });
    const time = page.getByRole("link", { name: /Time format/ });

    await expect(opens).toContainText("Library");
    await expect(page.getByRole("link", { name: /Language/ })).toBeVisible();
    await expect(time).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(
      page.getByText("The reader, where you left it", { exact: false }),
    ).toHaveCount(0);
  });

  test("opens a picker page for where Omnileaf opens, and keeps the choice", async ({
    page,
  }) => {
    await page.goto("/settings/general");
    await page.getByRole("link", { name: /Omnileaf opens on/ }).click();

    await expect(page).toHaveURL(/\/settings\/general\/opens-on$/);
    await expect(
      page.getByRole("radio", { name: "Library", exact: true }),
    ).toBeChecked();
    await page.getByRole("radio", { name: "History", exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "History", exact: true }),
    ).toBeChecked();
    await page.getByRole("link", { name: "Back to General" }).click();

    await expect(
      page.getByRole("link", { name: /Omnileaf opens on/ }),
    ).toContainText("History");
  });

  test("opens a picker page for the time format", async ({ page }) => {
    await page.goto("/settings/general");
    await page.getByRole("link", { name: /Time format/ }).click();

    await expect(page).toHaveURL(/\/settings\/general\/time-format$/);
    await expect(page.getByRole("radio")).toHaveCount(3);
    for (const choice of await page.getByRole("radio").all()) {
      expect((await boxOf(choice)).height).toBeGreaterThanOrEqual(
        TOUCH_TARGET_PX,
      );
    }
    await page.getByRole("radio", { name: "24-hour" }).click();
    await page.getByRole("link", { name: "Back to General" }).click();

    await expect(page.getByRole("link", { name: /Time format/ })).toContainText(
      "24-hour",
    );
  });
});
