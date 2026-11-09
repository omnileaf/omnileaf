import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const STATUS_BAR = 47;
const BAR_ROW = 44;

test.use({ backend: DEFAULT_BACKEND });

test.describe("the Settings index on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(async ({ page, platform }) => {
    test.skip(platform !== "ios", "iOS's grouped list");
    await page.addInitScript((inset) => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = `:root { --system-inset-top: ${String(inset)}px; }`;
        document.head.append(style);
      });
    }, STATUS_BAR);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("sets each group heading in 17px body type at weight 590, as written", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { level: 2, name: "App" });

    await expect(heading).toHaveCSS("font-size", "17px");
    await expect(heading).toHaveCSS("font-weight", "590");
    await expect(heading).toHaveCSS("text-transform", "none");
  });

  test("leaves the empty bar row above the large title, as every iOS top page does", async ({
    page,
  }) => {
    const title = await boxOf(page.getByRole("heading", { level: 1 }));

    expect(title.y).toBeCloseTo(STATUS_BAR + BAR_ROW, 0);
  });
});
