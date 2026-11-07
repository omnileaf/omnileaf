import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

test.describe("About on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("sets each row's name at 16px in regular weight over a 14px line, with no chevron", async ({
    page,
  }) => {
    await page.goto("/settings/about");
    const row = page
      .getByRole("main")
      .getByRole("link", { name: /^Open-source licences/ });
    const name = row.getByText("Open-source licences", { exact: true });
    const line = row.getByText(/^The packages/);

    await expect(name).toHaveCSS("font-size", "16px");
    await expect(name).toHaveCSS("font-weight", "400");
    await expect(line).toHaveCSS("font-size", "14px");
    await expect(line).toHaveCSS("line-height", "20px");
    await expect(row.locator("svg:visible")).toHaveCount(0);
    await expect(name).toHaveCSS("letter-spacing", "0.5px");
  });

  test("sets the rows flush with bare 24px icons at x=16 and names at x=56, with no line between them", async ({
    page,
  }) => {
    await page.goto("/settings/about");
    const list = page.getByRole("main").getByRole("list").first();
    const row = list.getByRole("link", { name: /^Report a problem/ });
    const icon = row.locator("[data-icon=bug]");

    expect((await boxOf(icon)).x).toBe(16);
    expect((await boxOf(icon)).width).toBe(24);
    expect(
      (await boxOf(row.getByText("Report a problem", { exact: true }))).x,
    ).toBe(56);
    await expect(list).toHaveCSS("border-top-width", "0px");
    await expect(row).toHaveCSS("border-bottom-width", "0px");
    expect((await boxOf(row)).x).toBe(0);
  });

  test("names the app in 24px regular type over a round icon", async ({
    page,
  }) => {
    await page.goto("/settings/about");
    const name = page.getByRole("heading", { name: "Omnileaf", level: 2 });
    const icon = page.getByRole("main").locator("img").first();

    await expect(name).toHaveCSS("font-weight", "400");
    await expect(name).toHaveCSS("font-size", "24px");
    await expect(name).toHaveCSS("line-height", "32px");
    expect((await boxOf(icon)).width).toBe(72);
    expect(
      parseFloat(
        await icon.evaluate((node) => getComputedStyle(node).borderRadius),
      ),
    ).toBeGreaterThanOrEqual(36);
  });
});

const CHECKED_SCREENS = [
  "/settings/about",
  "/settings/about/licences",
] as const;

test.describe(
  "About checked for accessibility on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    for (const colorScheme of ["light", "dark"] as const) {
      for (const route of CHECKED_SCREENS) {
        test(`has no accessibility violations on ${route} in the ${colorScheme} theme`, async ({
          page,
        }) => {
          await page.emulateMedia({ colorScheme });
          await page.goto(route);
          await expect(page.getByRole("main")).toBeVisible();

          expect(await accessibilityViolations(page)).toEqual([]);
        });
      }
    }
  },
);
