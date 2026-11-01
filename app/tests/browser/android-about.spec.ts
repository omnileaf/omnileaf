import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

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
    await expect(row.locator("svg:visible")).toHaveCount(1);
  });
});
