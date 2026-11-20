import type { Page } from "@playwright/test";

import {
  sampleBookId,
  sampleSeriesId,
} from "../../src/lib/sample-library/sample-library.ts";
import { expect, test } from "./fixtures.ts";
import { sampleLibraryOn, serveSampleArt } from "./screens.ts";

const SERIES = sampleSeriesId(4);
const SERIES_PAGE = `/series/${SERIES}`;
const BOOK = sampleBookId(4, 3);
const READER = `/read/${BOOK}`;
const NEXT_READER = `/read/${sampleBookId(4, 4)}`;

async function followInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((href) => {
    const link = document.createElement("a");
    link.href = href;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await expect(page).toHaveURL(path);
}

async function openFromSeriesPage(page: Page): Promise<void> {
  await page.goto("/");
  await followInApp(page, SERIES_PAGE);
  await page
    .locator(`a[href="${READER}"]`)
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(READER);
}

test.use({ backend: sampleLibraryOn("android") });

test.describe(
  "going back from the reader on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(async ({ page, platform }) => {
      test.skip(platform !== "android", "Android's back gesture");
      await serveSampleArt(page);
    });

    test("returns to the series page the book was opened from", async ({
      page,
    }) => {
      await openFromSeriesPage(page);

      await page.goBack();

      await expect(page).toHaveURL(SERIES_PAGE);
    });

    test("leaves no reader under the series page when Back is tapped", async ({
      page,
    }) => {
      await openFromSeriesPage(page);
      await page.getByRole("link", { name: /^Back to / }).click();
      await expect(page).toHaveURL(SERIES_PAGE);

      await page.goBack();

      await expect(page).toHaveURL("/");
    });

    test("puts the series page in the reader's place when the app opened straight into the book", async ({
      page,
    }) => {
      await page.goto(READER);
      await page.getByRole("link", { name: /^Back to / }).click();
      await expect(page).toHaveURL(SERIES_PAGE);

      await page.goBack();

      await expect(page).not.toHaveURL(READER);
    });

    test("returns to the series page after moving on to the next chapter", async ({
      page,
    }) => {
      await openFromSeriesPage(page);
      await page.getByRole("link", { name: /^Next chapter/ }).click();
      await expect(page).toHaveURL(NEXT_READER);

      await page.goBack();

      await expect(page).toHaveURL(SERIES_PAGE);
    });
  },
);
