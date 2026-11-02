import { DEFAULT_BACKEND, expect, test, tokenColour } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const PANEL_RADIUS = "28px";

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

test.describe("quick open on Android", { tag: "@native" }, () => {
  test.beforeEach(async ({ page, platform }) => {
    test.skip(platform !== "android", "Material's docked search view");
    await page.goto("/");
    await expect(
      page.getByRole("list", { name: "Series" }).getByRole("listitem"),
    ).toHaveCount(LIBRARY.length);
    await page.keyboard.press("Control+k");
    await expect(
      page.getByRole("dialog", { name: "Quick open" }),
    ).toBeVisible();
  });

  test("dims nothing behind the panel", async ({ page }) => {
    await expect(page.locator("[data-dialog-overlay]")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  });

  test("draws the panel on the raised container colour with a 28px radius and no edge", async ({
    page,
  }) => {
    const panel = page.getByRole("dialog", { name: "Quick open" });

    await expect(panel).toHaveCSS(
      "background-color",
      await tokenColour(page, "--android-container-high"),
    );
    await expect(panel).toHaveCSS("border-top-left-radius", PANEL_RADIUS);
    await expect(panel).toHaveCSS("border-top-width", "0px");
  });

  test("sets group headings in sentence case, not capitals", async ({
    page,
  }) => {
    const heading = page
      .getByRole("dialog", { name: "Quick open" })
      .getByText("Actions", { exact: true });

    await expect(heading).toHaveCSS("text-transform", "none");
  });

  test("marks the chosen row with a quiet overlay, not the accent tint", async ({
    page,
  }) => {
    const chosen = page
      .getByRole("dialog", { name: "Quick open" })
      .locator("[aria-selected='true']")
      .first();

    await expect(chosen).not.toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-accent-soft"),
    );
    await expect(chosen).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });
});
