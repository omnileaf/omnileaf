import type { Page } from "@playwright/test";

import {
  expect,
  EXPANDED_MIN_WIDTH,
  fakeAppInfo,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const BOOKS = [
  { state: "read" },
  { state: "started", page: 14 },
  { state: "notStarted" },
] as const;

test.use({
  backend: {
    ...new FakeShelf(BOOKS, {}, 192).backend(),
    appInfo: () => fakeAppInfo("ios"),
  },
});

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test("lays the series page on the iOS grouped ground, its cards as grouped cells", async ({
  page,
}) => {
  await openSeries(page);

  await expect(page.locator('[data-ground="grouped"]')).toHaveCSS(
    "background-color",
    await tokenColour(page, "--ios-grouped-bg"),
  );
  const card = page.locator('[data-slot="card"]').first();
  await expect(card).toHaveCSS(
    "background-color",
    await tokenColour(page, "--ios-grouped-cell"),
  );
  await expect(card).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
});

test("raises the chosen segment of a segmented control, as iOS does", async ({
  page,
}) => {
  await openSeries(page);
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "the iPad's wide layout is drawn apart",
  );

  const chosen = page
    .getByRole("group", { name: "Show" })
    .getByRole("radio", { checked: true });

  await expect(chosen).not.toHaveCSS("box-shadow", "none");
  await expect(chosen).toHaveCSS(
    "background-color",
    await tokenColour(page, "--ios-grouped-cell"),
  );
});
