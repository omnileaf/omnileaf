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
const DRAG_STEPS = 8;
const INSIDE_THE_ROW = 2;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    libraryCategories: () => [...CATEGORIES],
    categorySeriesCount: () => 6,
    seriesLabels: () => ({
      keepsLabels: true,
      categories: [],
      tags: [],
      suggestedTags: [],
    }),
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

  test("sets the tabs and New category in one grouped card with no border of its own", async ({
    page,
  }) => {
    const card = page
      .locator("[data-settings-group]")
      .filter({ has: page.getByRole("list", { name: "Library tabs" }) });

    await expect(
      card.getByRole("button", { name: "New category" }),
    ).toBeVisible();
    await expect(card).toHaveCSS("border-top-width", "0px");
    await expect(card).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-group"),
    );
  });

  test("sets New category as the card's last row, its plus where the handles sit", async ({
    page,
  }) => {
    const add = page.getByRole("button", { name: "New category" });
    const lastRow = page
      .getByRole("list", { name: "Library tabs" })
      .getByRole("listitem")
      .last();
    const name = lastRow.getByText("Manga", { exact: true });
    const handle = lastRow.getByRole("button", { name: "Move Manga" });

    const addBox = await boxOf(add);
    const rowBox = await boxOf(lastRow);
    const titleBox = await boxOf(add.getByText("New category"));
    const plusBox = await boxOf(add.locator("svg"));
    const nameBox = await boxOf(name);
    const handleBox = await boxOf(handle);

    expect(addBox.height).toBe(rowBox.height);
    await expect(page.getByRole("list", { name: "Library tabs" })).toHaveCSS(
      "border-bottom-width",
      "1px",
    );
    expect(titleBox.x).toBe(nameBox.x);
    expect(plusBox.x + plusBox.width / 2).toBeCloseTo(
      handleBox.x + handleBox.width / 2,
      0,
    );
  });

  test("moves a tab dragged by the handle at the end of its row", async ({
    page,
  }) => {
    const list = page.getByRole("list", { name: "Library tabs" });
    const reading = list
      .getByRole("listitem")
      .filter({ has: page.getByText("Reading", { exact: true }) });
    const manga = await boxOf(
      list
        .getByRole("listitem")
        .filter({ has: page.getByText("Manga", { exact: true }) }),
    );
    const handle = await boxOf(
      reading.getByRole("button", { name: "Move Reading" }),
    );
    const x = handle.x + handle.width / 2;

    await page.mouse.move(x, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, manga.y + manga.height - INSIDE_THE_ROW, {
      steps: DRAG_STEPS,
    });
    await page.mouse.up();

    await expect(list.getByRole("listitem").last()).toContainText("Reading");
    await expect(reading).toHaveCSS("box-shadow", "none");
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
  test("asks before deleting a category in an action sheet, Delete above Cancel", async ({
    page,
  }) => {
    await page
      .getByRole("listitem")
      .filter({ has: page.getByText("Manga", { exact: true }) })
      .getByRole("button", { name: "More for Manga" })
      .click();
    await expect(page.getByRole("menuitem")).toHaveText([
      "Move up",
      "Move down",
      "Hide this tab",
      "Rename",
      "Delete",
    ]);

    await page.getByRole("menuitem", { name: "Delete" }).click();

    const sheet = page.getByRole("alertdialog", { name: "Delete Manga?" });
    const remove = await boxOf(sheet.getByRole("button", { name: "Delete" }));
    const cancel = await boxOf(sheet.getByRole("button", { name: "Cancel" }));
    expect(remove.y).toBeLessThan(cancel.y);
    await expect(sheet).toContainText("Its 6 series stay in your library.");
  });
});
