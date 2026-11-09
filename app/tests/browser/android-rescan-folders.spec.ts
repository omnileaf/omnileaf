import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

const ROW_START = 16;
const ROW_TEXT_START = 56;
const MIN_ROW_HEIGHT = 56;

test.describe("Rescan folders on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("sits between Add a folder and Library tabs as a flush row with the refresh icon", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    const add = page.getByRole("button", { name: "Add a folder" });
    const rescan = page.getByRole("button", { name: /^Rescan folders/ });
    const tabs = page.getByRole("link", { name: /^Library tabs/ });

    expect((await boxOf(add)).y).toBeLessThan((await boxOf(rescan)).y);
    expect((await boxOf(rescan)).y).toBeLessThan((await boxOf(tabs)).y);
    expect((await boxOf(rescan)).x).toBe(0);
    expect((await boxOf(rescan)).height).toBeGreaterThanOrEqual(MIN_ROW_HEIGHT);
    await expect(rescan).toHaveCSS("border-top-width", "0px");
    expect((await boxOf(rescan.locator("[data-icon=refresh-cw]"))).x).toBe(
      ROW_START,
    );
    expect((await boxOf(rescan.getByText("Rescan folders"))).x).toBe(
      ROW_TEXT_START,
    );
  });

  test("says Off until Every day is chosen, and keeps the same setting as Settings > Advanced", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    const rescan = page.getByRole("button", { name: /^Rescan folders/ });
    await expect(rescan).toContainText("Off");
    await expect(rescan).toHaveAttribute("aria-haspopup", "dialog");

    await rescan.click();
    await page
      .getByRole("dialog", { name: "Rescan folders" })
      .getByRole("radio", { name: "Every day" })
      .click();
    await expect(rescan).toContainText("Every day");
    await page.goto("/settings/advanced");

    await expect(
      page.getByRole("switch", {
        name: /^Check folders for new books/,
      }),
    ).toBeChecked();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations on Settings > Library in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/settings/library");
      await expect(
        page.getByRole("button", { name: /^Rescan folders/ }),
      ).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
