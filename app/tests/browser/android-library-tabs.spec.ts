import type {
  LibraryCategory,
  LibraryTab,
} from "../../src/lib/ipc/bindings.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const CATEGORIES = [
  { id: "reading", name: "Reading" },
  { id: "manga", name: "Manga" },
] as LibraryCategory[];
const TABS: readonly LibraryTab[] = [
  { id: { kind: "all" }, isHidden: false },
  { id: { kind: "newChapters" }, isHidden: true },
];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    libraryCategories: () => [...CATEGORIES],
    categorySeriesCount: () => 6,
    libraryTabs: () => [...TABS],
    seriesLabels: () => ({
      keepsLabels: true,
      categories: [],
      tags: [],
      suggestedTags: [],
    }),
  },
});

test.describe("Library tabs on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("lists the tabs flat, no card and no rules between rows", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const list = page.getByRole("list", { name: "Library tabs" });
    const row = list.getByRole("listitem").filter({ hasText: "Reading" });

    await expect(list).toHaveCSS("border-top-width", "0px");
    await expect(list).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(row).toHaveCSS("border-top-width", "0px");
  });

  test("sets each row at 72px with a 16px name over a 14px line, the handle and More as 48px buttons", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const list = page.getByRole("list", { name: "Library tabs" });
    const row = list.getByRole("listitem").filter({ hasText: "Reading" });
    const name = row.getByText("Reading", { exact: true });
    const detail = row.getByText("Category · 6 series");
    const handle = row.getByRole("button", { name: /^Move Reading/ });
    const more = row.getByRole("button", { name: "More for Reading" });

    expect((await boxOf(row)).height).toBeGreaterThanOrEqual(72);
    await expect(name).toHaveCSS("font-size", "16px");
    await expect(name).toHaveCSS("line-height", "24px");
    await expect(name).toHaveCSS("font-weight", "400");
    await expect(detail).toHaveCSS("font-size", "14px");
    await expect(detail).toHaveCSS("line-height", "20px");
    expect(await boxOf(handle)).toMatchObject({ width: 48, height: 48 });
    expect(await boxOf(more)).toMatchObject({ width: 48, height: 48 });
    expect((await boxOf(handle)).x - (await boxOf(row)).x).toBeCloseTo(4, 0);
  });

  test("shows More as three dots one above the other", async ({ page }) => {
    await page.goto("/settings/library/tabs");
    const more = page
      .getByRole("listitem")
      .filter({ hasText: "Reading" })
      .getByRole("button", { name: "More for Reading" });

    await expect(more.locator("svg.lucide-ellipsis-vertical")).toBeVisible();
  });

  test("sets New category as an outlined pill under the list, 16px in", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const add = page.getByRole("button", { name: "New category" });
    const list = page.getByRole("list", { name: "Library tabs" });

    expect((await boxOf(add)).x).toBeCloseTo(16, 0);
    expect((await boxOf(add)).y).toBeGreaterThan(
      (await boxOf(list)).y + (await boxOf(list)).height,
    );
  });

  test("sets where the library opens as a two-line row that opens a choice dialog", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const row = page.getByRole("button", { name: /^The library opens on/ });

    await expect(row).toContainText("The tab used last");
    await expect(row).toHaveAttribute("aria-haspopup", "dialog");
    await expect(
      page.getByText("If it would open on New chapters", { exact: false }),
    ).toBeVisible();
    await row.click();
    const dialog = page.getByRole("dialog", { name: "The library opens on" });
    await expect(dialog.getByRole("radio")).toHaveCount(4);
    await dialog.getByRole("radio", { name: "Reading" }).click();

    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Reading");
  });

  test("lifts the row a little off the page while it is dragged, then sets it down", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const row = page.getByRole("listitem").filter({ hasText: "Reading" });
    const handle = row.getByRole("button", { name: /^Move Reading/ });
    const box = await boxOf(handle);

    await expect(row).toHaveCSS("scale", "none");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20);

    await expect(row).toHaveCSS("scale", "1.02");
    await expect(row).toHaveCSS("translate", "0px -6px");
    await expect(row).not.toHaveCSS("box-shadow", "none");
    await page.mouse.up();
    await expect(row).toHaveCSS("scale", "none");
  });
});
