import type { Page } from "@playwright/test";

import { boxOf, expect, testOnlyInItsWebview, test } from "./fixtures.ts";
import { SectionShelf, volumes } from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READ_VOLUME_TWO = {
  kind: "volume",
  numbers: { first: 2, last: 2 },
  reading: { state: "read" },
} as const;

testOnlyInItsWebview("macos");
test.use({ platform: "macos" });

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

async function commandClick(page: Page, name: string): Promise<void> {
  await volumeCovers(page)
    .getByRole("link", { name })
    .click({ modifiers: ["Meta"] });
}

function toolbar(page: Page) {
  return page.getByRole("group", { name: "Selected books" });
}

test.describe("picking a series' covers on macOS with Cmd", () => {
  const shelf = new SectionShelf([
    ...volumes(1),
    READ_VOLUME_TWO,
    ...volumes(3, 4, 7),
  ]);
  test.use({ backend: shelf.backend() });

  test("picks a cover clicked with Cmd and leaves the rest", async ({
    page,
  }) => {
    await openSeries(page);

    await commandClick(page, "Volume 1");

    await expect(pickBox(page, "Volume 1")).toBeChecked();
    await expect(pickBox(page, "Volume 3")).not.toBeChecked();
  });

  test("picks every cover between two with Shift", async ({ page }) => {
    await openSeries(page);

    await commandClick(page, "Volume 3");
    await pickBox(page, "Volume 7").click({ modifiers: ["Shift"] });

    await expect(pickBox(page, "Volume 3")).toBeChecked();
    await expect(pickBox(page, "Volume 4")).toBeChecked();
    await expect(pickBox(page, "Volume 7")).toBeChecked();
    await expect(pickBox(page, "Volume 1")).not.toBeChecked();
  });

  test("starts picking with the cover in focus on Space", async ({ page }) => {
    await openSeries(page);

    await volumeCovers(page).getByRole("link", { name: "Volume 3" }).focus();
    await page.keyboard.press("Space");

    await expect(pickBox(page, "Volume 3")).toBeChecked();
    await expect(pickBox(page, "Volume 3")).toBeFocused();
  });

  test("picks every cover with Cmd A, and lets them go with Escape", async ({
    page,
  }) => {
    await openSeries(page);
    await volumeCovers(page).getByRole("link", { name: "Volume 1" }).focus();

    await page.keyboard.press("Meta+a");

    await expect(
      volumeCovers(page).getByRole("checkbox", { checked: true }),
    ).toHaveCount(5);

    await page.keyboard.press("Escape");

    await expect(volumeCovers(page).getByRole("checkbox")).toHaveCount(0);
  });
});

test.describe("dragging a box over the covers on macOS", () => {
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

  test("picks the covers a box dragged touches, never the gap", async ({
    page,
  }) => {
    await openSeries(page);

    await dragFromBeforeTheGapToVolumeFour(page);

    await expect(pickBox(page, "Volume 4")).toBeChecked();
    await expect(pickBox(page, "Volume 1")).not.toBeChecked();
  });

  test("keeps the covers picked before when the drag starts with Cmd held", async ({
    page,
  }) => {
    await openSeries(page);
    await commandClick(page, "Volume 1");

    await page.keyboard.down("Meta");
    await dragFromBeforeTheGapToVolumeFour(page);
    await page.keyboard.up("Meta");

    await expect(pickBox(page, "Volume 1")).toBeChecked();
    await expect(pickBox(page, "Volume 4")).toBeChecked();
  });
});

test.describe("marking the picked covers on macOS", () => {
  const shelf = new SectionShelf([...volumes(1), READ_VOLUME_TWO]);
  test.use({ backend: shelf.backend() });

  test("marks them read and says so", async ({ page }) => {
    await openSeries(page);
    await commandClick(page, "Volume 1");

    await toolbar(page).getByRole("button", { name: "Mark read" }).click();

    await expect(
      page.getByRole("status").filter({ hasText: "Marked" }),
    ).toHaveText("Marked 1 book read");
    await expect(
      volumeCovers(page).getByRole("link", { name: "Volume 1" }),
    ).toHaveText(/Read$/);
  });

  test("marks them unread and says so", async ({ page }) => {
    await openSeries(page);
    await commandClick(page, "Volume 2");

    await toolbar(page).getByRole("button", { name: "Mark unread" }).click();

    await expect(
      page.getByRole("status").filter({ hasText: "Marked" }),
    ).toHaveText("Marked 1 book unread");
    await expect(
      volumeCovers(page).getByRole("link", { name: "Volume 2" }),
    ).toHaveText(/Unread$/);
  });
});

test.describe("the picked covers in the macOS title bar", () => {
  const shelf = new SectionShelf([...volumes(1, 3, 4)]);
  test.use({ backend: shelf.backend() });

  test("counts them and holds their actions in the title bar", async ({
    page,
  }) => {
    await openSeries(page);

    await commandClick(page, "Volume 1");

    const titleBar = page.locator("[data-page-toolbar]");
    await expect(titleBar.getByRole("status")).toHaveText("1 of 3 selected");
    await expect(
      titleBar
        .getByRole("group", { name: "Selected books" })
        .getByRole("button", { name: "Mark read" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(titleBar.getByRole("status")).toBeEmpty();
    await expect(
      titleBar.getByRole("group", { name: "Selected books" }),
    ).toHaveCount(0);
  });
});
