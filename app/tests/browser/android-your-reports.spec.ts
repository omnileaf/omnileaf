import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

test.describe("Your reports on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(async ({ page, platform }) => {
    test.skip(platform !== "android", "Android's list rows");
    await page.addInitScript(
      (kept) => {
        window.localStorage.setItem("omnileaf.yourReports", kept);
      },
      JSON.stringify([
        { code: "R-2QX9", madeAtMs: Date.UTC(2026, 9, 15, 18, 5) },
      ]),
    );
  });

  test("lists each report as a flat two-line row, the date in regular weight over a 14px code line", async ({
    page,
  }) => {
    await page.goto("/settings/about/reports");
    const row = page
      .getByRole("list", { name: "Your reports" })
      .getByRole("listitem")
      .first();
    const date = row.locator("span").first();
    const code = row.getByText("Code R-2QX9");

    await expect(date).toHaveCSS("font-weight", "400");
    await expect(date).toHaveCSS("font-size", "16px");
    await expect(code).toHaveCSS("font-size", "14px");
    await expect(code).toHaveCSS("line-height", "20px");
    expect((await boxOf(row)).height).toBeGreaterThanOrEqual(72);
  });
});
