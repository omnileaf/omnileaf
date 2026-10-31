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
});
