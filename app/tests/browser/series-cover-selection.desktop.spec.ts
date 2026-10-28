import type { Page } from "@playwright/test";

import { accessibilityViolations, boxOf, expect, test } from "./fixtures.ts";
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

function toolbar(page: Page) {
  return page.getByRole("group", { name: "Selected books" });
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
      toolbar(page).getByText("3 books", { exact: true }),
    ).toBeVisible();
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

test.describe("picking every cover and letting them go", () => {
  const shelf = new SectionShelf(
    [...volumes(1), READ_VOLUME_TWO, ...volumes(3, 4, 7)],
    [{ first: 5, last: 6 }],
  );
  test.use({ backend: shelf.backend() });

  test("picks every cover but the gap with Ctrl A, and lets them go with Escape", async ({
    page,
  }) => {
    await openSeries(page);
    await volumeCovers(page).getByRole("link", { name: "Volume 1" }).focus();

    await page.keyboard.press("ControlOrMeta+a");

    await expect(
      volumeCovers(page).getByRole("checkbox", { checked: true }),
    ).toHaveCount(5);
    await expect(
      volumeCovers(page).getByRole("img", { name: GAP_NAME }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("5 selected");

    await page.keyboard.press("Escape");

    await expect(volumeCovers(page).getByRole("checkbox")).toHaveCount(0);
  });

  test("keeps the covers picked when Escape closes quick open", async ({
    page,
  }) => {
    await openSeries(page);
    await ctrlClick(page, "Volume 1");
    await page.keyboard.press("ControlOrMeta+k");
    const quickOpen = page.getByRole("dialog", { name: "Quick open" });
    await expect(quickOpen).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(quickOpen).toBeHidden();
    await expect(pickBox(page, "Volume 1")).toBeChecked();
  });

  test("keeps focus on the cover picking started from once Escape stops it", async ({
    page,
  }) => {
    await openSeries(page);
    await volumeCovers(page).getByRole("link", { name: "Volume 3" }).focus();
    await page.keyboard.press("Space");

    await page.keyboard.press("Escape");

    await expect(
      volumeCovers(page).getByRole("link", { name: "Volume 3" }),
    ).toBeFocused();
  });
});

test.describe("marking the picked covers", () => {
  const shelf = new SectionShelf([
    ...volumes(1),
    READ_VOLUME_TWO,
    ...volumes(3),
  ]);
  test.use({ backend: shelf.backend() });

  test("marks them read and says so", async ({ page }) => {
    await openSeries(page);
    await ctrlClick(page, "Volume 1");
    await pickBox(page, "Volume 3").click();

    await toolbar(page).getByRole("button", { name: "Mark read" }).click();

    await expect(page.getByRole("status")).toHaveText("Marked 2 books read");
    for (const name of ["Volume 1", "Volume 3"]) {
      await expect(volumeCovers(page).getByRole("link", { name })).toHaveText(
        /Read$/,
      );
    }
  });

  test("marks them unread and says so", async ({ page }) => {
    await openSeries(page);
    await ctrlClick(page, "Volume 2");

    await toolbar(page).getByRole("button", { name: "Mark unread" }).click();

    await expect(page.getByRole("status")).toHaveText("Marked 1 book unread");
    await expect(
      volumeCovers(page).getByRole("link", { name: "Volume 2" }),
    ).toHaveText(/Unread$/);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations while picking in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openSeries(page);
      await ctrlClick(page, "Volume 1");
      await expect(toolbar(page)).toBeVisible();

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("going back while picking", () => {
  const shelved = {
    id: SERIES_ID,
    title: SERIES_TITLE,
    bookCount: 2,
    unreadCount: 2,
    cover: null,
    language: null,
    hasDownloads: false,
    isAdult: false,
    continuesFrom: null,
  };
  test.use({
    backend: {
      ...new SectionShelf(volumes(1, 2)).backend(),
      librarySeries: () => ({ series: [shelved], next: null }),
      librarySeriesCount: () => 1,
    },
  });

  test("stops picking and stays on the series", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: SERIES_TITLE }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
    ).toBeVisible();
    await ctrlClick(page, "Volume 1");

    await page.goBack();

    await expect(volumeCovers(page).getByRole("link")).toHaveCount(2);
    await expect(
      page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
    ).toBeVisible();
  });
});

test.describe("dragging a box over the covers", () => {
  const INTO_THE_ROW_PX = 10;
  const shelf = new SectionShelf(volumes(1, 4, 5), [{ first: 2, last: 3 }]);
  test.use({ backend: shelf.backend() });

  function itemOf(page: Page, index: number) {
    return volumeCovers(page).getByRole("listitem").nth(index);
  }

  async function dragFromBeforeTheGapToVolumeFour(page: Page): Promise<void> {
    const first = await boxOf(itemOf(page, 0));
    const gap = await boxOf(itemOf(page, 1));
    const volumeFour = await boxOf(itemOf(page, 2));
    await page.mouse.move(
      (first.x + first.width + gap.x) / 2,
      gap.y + INTO_THE_ROW_PX,
    );
    await page.mouse.down();
    await page.mouse.move(
      volumeFour.x + volumeFour.width / 2,
      volumeFour.y + volumeFour.height / 2,
      { steps: 4 },
    );
    await page.mouse.up();
  }

  test("picks the covers a box dragged on empty space touches, never the gap", async ({
    page,
  }) => {
    await openSeries(page);

    await dragFromBeforeTheGapToVolumeFour(page);

    await expect(pickBox(page, "Volume 4")).toBeChecked();
    await expect(pickBox(page, "Volume 1")).not.toBeChecked();
    await expect(
      volumeCovers(page).getByRole("img", {
        name: "Volumes 2 and 3 are not in the folder",
      }),
    ).toBeVisible();
  });

  test("keeps the covers picked before when the drag starts with Ctrl held", async ({
    page,
  }) => {
    await openSeries(page);
    await ctrlClick(page, "Volume 1");

    await page.keyboard.down("ControlOrMeta");
    await dragFromBeforeTheGapToVolumeFour(page);
    await page.keyboard.up("ControlOrMeta");

    await expect(pickBox(page, "Volume 1")).toBeChecked();
    await expect(pickBox(page, "Volume 4")).toBeChecked();
  });
});
