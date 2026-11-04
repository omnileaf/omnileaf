import type { LibraryCategory } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";

const CATEGORIES = [
  { id: "reading", name: "Reading" },
  { id: "manga", name: "Manga" },
] as LibraryCategory[];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    libraryCategories: () => [...CATEGORIES],
    categorySeriesCount: () => 6,
  },
});

test.describe("Library tabs on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(async ({ page, platform }) => {
    test.skip(platform !== "ios", "iOS's grouped list");
    await page.goto("/settings/library/tabs");
    await expect(
      page.getByRole("list", { name: "Library tabs" }),
    ).toBeVisible();
  });

  test("sets the tabs in one grouped card with no border of its own", async ({
    page,
  }) => {
    const card = page.getByRole("list", { name: "Library tabs" });

    await expect(card).toHaveCSS("border-top-width", "0px");
    await expect(card).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-group"),
    );
  });

  test("puts the reorder handle at the end of the row, after the more button", async ({
    page,
  }) => {
    const more = await boxOf(
      page.getByRole("button", { name: "More for All" }),
    );
    const handle = await boxOf(page.getByRole("button", { name: "Move All" }));

    expect(handle.x).toBeGreaterThan(more.x + more.width - 1);
  });

  test("sets where the library opens as a grouped row with its value and a chevron", async ({
    page,
  }) => {
    const row = page.getByRole("button", { name: /^The library opens on/ });

    await expect(row).toContainText("The tab used last");
    expect((await boxOf(row)).height).toBeGreaterThanOrEqual(44);
  });

  test("offers the tabs to open on and keeps the one chosen", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /^The library opens on/ }).click();
    const choices = page.getByRole("dialog", { name: "The library opens on" });
    await choices.getByRole("radio", { name: "Manga" }).click();
    await expect(choices).toBeHidden();

    await expect(
      page.getByRole("button", { name: /^The library opens on/ }),
    ).toContainText("Manga");
  });

  test("sets a tab's name in 17px row type, its detail in 15px, and Hidden as a plain word", async ({
    page,
  }) => {
    const row = page.getByRole("listitem").filter({ hasText: "Reading" });

    await expect(row.getByText("Reading", { exact: true })).toHaveCSS(
      "font-size",
      "17px",
    );
    await expect(row.getByText(/^Category/)).toHaveCSS("font-size", "15px");
    const hidden = page
      .getByRole("listitem")
      .filter({ hasText: "New chapters" })
      .getByText("Hidden", { exact: true });
    await expect(hidden).toHaveCSS("border-top-width", "0px");
  });

  test("draws the more button as a 34px circle with a 20px icon", async ({
    page,
  }) => {
    const more = page.getByRole("button", { name: "More for Reading" });
    const box = await boxOf(more);
    const icon = await boxOf(more.locator("svg"));

    expect(box.width).toBeCloseTo(34, 0);
    expect(box.height).toBeCloseTo(34, 0);
    expect(icon.width).toBeCloseTo(20, 0);
  });
});
