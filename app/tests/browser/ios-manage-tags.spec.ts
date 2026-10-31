import type { Locator, Page } from "@playwright/test";

import type { LibraryTag } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";

const FIRST_TAGS: readonly LibraryTag[] = [
  { name: "Slice of life", seriesCount: 12 },
  { name: "Seinen", seriesCount: 7 },
];
const SWIPE_PX = -220;

let tags: LibraryTag[] = [...FIRST_TAGS];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    libraryTags: () => tags,
    removeLibraryTag: (tag) => {
      tags = tags.filter((one) => one.name !== tag);
      return [];
    },
  },
});

test.beforeEach(() => {
  tags = [...FIRST_TAGS];
});

function rowOf(page: Page, tag: string): Locator {
  return page
    .getByRole("list", { name: "Tags" })
    .getByRole("listitem")
    .filter({ hasText: tag });
}

async function swipeAcross(target: Locator, across: number): Promise<void> {
  const box = await boxOf(target);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const at = (moved: number) => ({
    pointerType: "touch",
    pointerId: 7,
    isPrimary: true,
    clientX: start.x + moved,
    clientY: start.y,
  });
  await target.dispatchEvent("pointerdown", at(0));
  for (const moved of [across / 4, across / 2, across]) {
    await target.dispatchEvent("pointermove", at(moved));
  }
  await target.dispatchEvent("pointerup", at(across));
}

async function isUncovered(control: Locator): Promise<boolean> {
  return control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    return top !== null && element.contains(top);
  });
}

test.describe("Manage tags on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(async ({ page, platform }) => {
    test.skip(platform !== "ios", "iOS's swipe actions");
    await page.goto("/settings/library/tags");
    await expect(rowOf(page, "Seinen")).toBeVisible();
  });

  test("sets each tag's count at the end of its row", async ({ page }) => {
    const row = await boxOf(rowOf(page, "Seinen"));
    const count = await boxOf(rowOf(page, "Seinen").getByText("7 series"));

    expect(count.x + count.width).toBeGreaterThan(row.x + row.width - 32);
  });

  test("shows Rename in green and Delete in red from a swipe toward the start", async ({
    page,
  }) => {
    const rename = rowOf(page, "Seinen").getByRole("button", {
      name: "Rename Seinen",
    });
    const remove = rowOf(page, "Seinen").getByRole("button", {
      name: "Delete Seinen",
    });

    await swipeAcross(rowOf(page, "Seinen").locator("[data-swiped]"), SWIPE_PX);

    expect(await isUncovered(rename)).toBe(true);
    expect(await isUncovered(remove)).toBe(true);
    await expect(rename).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-primary"),
    );
    await expect(remove).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-swipe-destructive"),
    );
  });

  test("deletes a tag from its swipe action and offers Undo", async ({
    page,
  }) => {
    await swipeAcross(rowOf(page, "Seinen").locator("[data-swiped]"), SWIPE_PX);

    await rowOf(page, "Seinen")
      .getByRole("button", { name: "Delete Seinen" })
      .click();

    await expect(rowOf(page, "Seinen")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });
});
