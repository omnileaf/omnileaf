import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(40);
const INTO_THE_ROW_PX = 10;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
  } satisfies FakeBackend,
});

test.skip(({ hasTouch }) => hasTouch, "a box is drawn with a mouse");

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function cellOf(page: Page, index: number): Locator {
  return seriesList(page).locator(`[aria-posinset="${String(index + 1)}"]`);
}

function dragBox(page: Page): Locator {
  return page.locator("[data-drag-box]");
}

async function columnsOf(page: Page): Promise<number> {
  return seriesList(page).evaluate(
    (list) =>
      getComputedStyle(list)
        .gridTemplateColumns.split(" ")
        .filter((track) => track !== "").length,
  );
}

async function startInTheGapBeforeTheSecondCover(page: Page): Promise<void> {
  await page.goto("/");
  await expect(cellOf(page, 1)).toBeVisible();
  const first = await boxOf(cellOf(page, 0));
  const second = await boxOf(cellOf(page, 1));
  await page.mouse.move(
    (first.x + first.width + second.x) / 2,
    first.y + INTO_THE_ROW_PX,
  );
  await page.mouse.down();
}

async function moveToTheMiddleOf(page: Page, index: number): Promise<void> {
  const cell = await boxOf(cellOf(page, index));
  await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, {
    steps: 4,
  });
}

test("selects every cover a box dragged on empty space touches", async ({
  page,
}) => {
  await startInTheGapBeforeTheSecondCover(page);
  const columns = await columnsOf(page);

  await moveToTheMiddleOf(page, columns + 1);
  await page.mouse.up();

  for (const index of [1, columns + 1]) {
    await expect(
      seriesList(page).getByRole("checkbox", {
        name: LIBRARY[index]?.title ?? "",
      }),
    ).toBeChecked();
  }
  await expect(page.getByText("2 selected").first()).toBeVisible();
});

test("shows the box only while dragging", async ({ page }) => {
  await startInTheGapBeforeTheSecondCover(page);

  await moveToTheMiddleOf(page, 1);
  await expect(dragBox(page)).toBeVisible();
  await page.mouse.up();

  await expect(dragBox(page)).toHaveCount(0);
});

test("keeps the series picked before when the drag starts with Ctrl held", async ({
  page,
}) => {
  await page.goto("/");
  await cellOf(page, 0)
    .getByRole("link")
    .click({ modifiers: ["ControlOrMeta"] });
  const first = await boxOf(cellOf(page, 0));
  const second = await boxOf(cellOf(page, 1));
  await page.keyboard.down("Control");
  await page.mouse.move(
    (first.x + first.width + second.x) / 2,
    first.y + INTO_THE_ROW_PX,
  );
  await page.mouse.down();

  await moveToTheMiddleOf(page, 1);
  await page.mouse.up();
  await page.keyboard.up("Control");

  await expect(page.getByText("2 selected").first()).toBeVisible();
});
