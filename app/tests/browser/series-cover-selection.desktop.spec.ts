import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";
import {
  chapters,
  SectionShelf,
  type ShelvedBook,
  volumes,
} from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READ_VOLUME_TWO: ShelvedBook = {
  kind: "volume",
  numbers: { first: 2, last: 2 },
  reading: { state: "read" },
};
const SUMMER_SHORT: ShelvedBook = { kind: "special", title: "Summer Short" };
const GAP_NAME = "Volumes 5 and 6 are not in the folder";
const PICKED_RING = "solid 2px";

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

function volumeCovers(page: Page) {
  return page.getByRole("list", { name: "Volumes" });
}

function pickBox(page: Page, name: string) {
  return volumeCovers(page).getByRole("checkbox", { name, exact: true });
}

async function ctrlClick(page: Page, name: string): Promise<void> {
  await volumeCovers(page)
    .getByRole("link", { name })
    .click({ modifiers: ["ControlOrMeta"] });
}

function kinds(page: Page) {
  return page.getByRole("tablist", { name: "Kinds of book" });
}

test.describe("picking a series' covers", () => {
  const shelf = new SectionShelf(
    [
      ...volumes(1),
      READ_VOLUME_TWO,
      ...volumes(3, 4, 7),
      ...chapters(99),
      SUMMER_SHORT,
    ],
    [{ first: 5, last: 6 }],
  );
  test.use({ backend: shelf.backend() });

  test("picks a cover clicked with Ctrl and leaves the rest", async ({
    page,
  }) => {
    await openSeries(page);

    await ctrlClick(page, "Volume 1");

    await expect(pickBox(page, "Volume 1")).toBeChecked();
    await expect(pickBox(page, "Volume 3")).not.toBeChecked();
    await expect(volumeCovers(page).getByRole("link")).toHaveCount(0);
  });

  test("picks every cover between two with Shift, stepping over the gap", async ({
    page,
  }) => {
    await openSeries(page);

    await ctrlClick(page, "Volume 3");
    await pickBox(page, "Volume 7").click({ modifiers: ["Shift"] });

    await expect(pickBox(page, "Volume 3")).toBeChecked();
    await expect(pickBox(page, "Volume 4")).toBeChecked();
    await expect(pickBox(page, "Volume 7")).toBeChecked();
    await expect(pickBox(page, "Volume 1")).not.toBeChecked();
    await expect(
      volumeCovers(page).getByRole("img", { name: GAP_NAME }),
    ).toBeVisible();
  });

  test("lets a picked cover go with another click", async ({ page }) => {
    await openSeries(page);
    await ctrlClick(page, "Volume 1");

    await pickBox(page, "Volume 1").click();
    await pickBox(page, "Volume 3").click();

    await expect(pickBox(page, "Volume 1")).not.toBeChecked();
    await expect(pickBox(page, "Volume 3")).toBeChecked();
  });

  test("starts picking with the cover in focus on Space", async ({ page }) => {
    await openSeries(page);

    await volumeCovers(page).getByRole("link", { name: "Volume 3" }).focus();
    await page.keyboard.press("Space");

    await expect(pickBox(page, "Volume 3")).toBeChecked();
    await expect(pickBox(page, "Volume 3")).toBeFocused();
  });

  test("hides the read check while picking", async ({ page }) => {
    await openSeries(page);
    const readChecks = volumeCovers(page).locator("[data-read-mark]");
    await expect(readChecks).toHaveCount(1);

    await ctrlClick(page, "Volume 1");

    await expect(readChecks).toHaveCount(0);
    await expect(
      pickBox(page, "Volume 2").locator("[data-slot='selection-mark']"),
    ).toBeVisible();
  });

  test("rings a picked cover and no other", async ({ page }) => {
    await openSeries(page);

    await ctrlClick(page, "Volume 1");

    const ringOf = (name: string) =>
      pickBox(page, name)
        .locator("span")
        .first()
        .evaluate((cover) => {
          const style = getComputedStyle(cover);
          return `${style.outlineStyle} ${style.outlineWidth}`;
        });
    expect(await ringOf("Volume 1")).toBe(PICKED_RING);
    expect(await ringOf("Volume 3")).not.toBe(PICKED_RING);
  });

  test("picks the specials too", async ({ page }) => {
    await openSeries(page);
    await kinds(page).getByRole("tab", { name: "Specials" }).click();
    const specials = page.getByRole("list", { name: "Specials" });

    await specials
      .getByRole("link", { name: /Summer Short/ })
      .click({ modifiers: ["ControlOrMeta"] });

    await expect(
      specials.getByRole("checkbox", { name: "Summer Short" }),
    ).toBeChecked();
  });

  test("lets the picked covers go on another tab", async ({ page }) => {
    await openSeries(page);
    await ctrlClick(page, "Volume 1");

    await kinds(page).getByRole("tab", { name: "Chapters" }).click();
    await kinds(page).getByRole("tab", { name: "Volumes" }).click();

    await expect(
      volumeCovers(page).getByRole("link", { name: "Volume 1" }),
    ).toBeVisible();
    await expect(volumeCovers(page).getByRole("checkbox")).toHaveCount(0);
  });
});
