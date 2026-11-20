import type { Page } from "@playwright/test";

import {
  sampleBookId,
  sampleSeriesId,
} from "../../src/lib/sample-library/sample-library.ts";
import { expect, test } from "./fixtures.ts";
import { sampleLibraryOn, serveSampleArt } from "./screens.ts";

const LIBRARY = "/";
const HISTORY = "/history";
const SERIES = sampleSeriesId(4);
const SERIES_TITLE = "Sample Series 04";
const SERIES_PAGE = `/series/${SERIES}`;
const READER = `/read/${sampleBookId(4, 3)}`;
const NEXT_READER = `/read/${sampleBookId(4, 4)}`;
const ANY_READER = /\/read\/[^/]+$/;
const VOLUME_SERIES_PAGE = `/series/${sampleSeriesId(21)}`;
const VOLUME_PAGE = `${VOLUME_SERIES_PAGE}/volume/2`;
const SETTINGS = "/settings";
const APPEARANCE = "/settings/appearance";

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

async function openLibrary(page: Page): Promise<void> {
  await page.goto(LIBRARY);
  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
}

async function openFromSeriesPage(page: Page): Promise<void> {
  await openLibrary(page);
  await followInApp(page, SERIES_PAGE);
  await page
    .locator(`a[href="${READER}"]`)
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(READER);
}

async function expectBackAndGestureAgree(
  page: Page,
  origin: string,
  label: string,
): Promise<void> {
  const shown = page.url();
  const back = page.getByRole("link", { name: label, exact: true });

  await back.click();
  await expect(page).toHaveURL(origin);
  await page.goForward();
  await expect(page).toHaveURL(shown);
  await page.goBack();
  await expect(page).toHaveURL(origin);
}

async function tapPageBack(page: Page): Promise<void> {
  await page
    .getByRole("main")
    .locator("a[data-back-link]")
    .filter({ visible: true })
    .first()
    .click();
}

async function expectPageBackAndGestureAgree(
  page: Page,
  open: () => Promise<void>,
  origin: string,
): Promise<void> {
  await open();
  await tapPageBack(page);
  await expect(page).toHaveURL(origin);

  await open();
  await page.goBack();
  await expect(page).toHaveURL(origin);
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

      await expect(page).toHaveURL(LIBRARY);
    });

    test("takes Back and the gesture to the series page it was opened from", async ({
      page,
    }) => {
      await openFromSeriesPage(page);

      await expectBackAndGestureAgree(
        page,
        SERIES_PAGE,
        `Back to ${SERIES_TITLE}`,
      );
    });

    test("takes Back and the gesture to the library a book was continued from", async ({
      page,
    }) => {
      await openLibrary(page);
      await followInApp(page, READER);

      await expectBackAndGestureAgree(page, LIBRARY, "Back to the library");
    });

    test("takes Back and the gesture to History", async ({ page }) => {
      await openLibrary(page);
      await followInApp(page, HISTORY);
      await page
        .locator(`a[href="${READER}"]`)
        .filter({ visible: true })
        .first()
        .click();
      await expect(page).toHaveURL(READER);

      await expectBackAndGestureAgree(page, HISTORY, "Back to History");
    });

    test("takes Back and the gesture to the page Quick open was opened over", async ({
      page,
    }) => {
      await openLibrary(page);
      await page.keyboard.press("Control+k");
      const quickOpen = page.getByRole("dialog", { name: "Quick open" });
      await quickOpen.locator("input").fill(SERIES_TITLE);
      await quickOpen
        .getByRole("option", { name: new RegExp(SERIES_TITLE) })
        .first()
        .click();
      await expect(page).toHaveURL(ANY_READER);

      await expectBackAndGestureAgree(page, LIBRARY, "Back to the library");
    });

    test("takes Back and the gesture to the series page after moving on to the next chapter", async ({
      page,
    }) => {
      await openFromSeriesPage(page);
      await page.getByRole("link", { name: /^Next chapter/ }).click();
      await expect(page).toHaveURL(NEXT_READER);

      await expectBackAndGestureAgree(
        page,
        SERIES_PAGE,
        `Back to ${SERIES_TITLE}`,
      );
    });

    test("puts the series page in the reader's place when the app opened straight into the book", async ({
      page,
    }) => {
      await page.goto(READER);
      await page
        .getByRole("link", { name: `Back to ${SERIES_TITLE}`, exact: true })
        .click();
      await expect(page).toHaveURL(SERIES_PAGE);

      await page.goBack();

      await expect(page).not.toHaveURL(READER);
    });
  },
);

test.describe(
  "the back gesture and Back on Android's other pages",
  { tag: "@native" },
  () => {
    test.beforeEach(async ({ page, platform }) => {
      test.skip(platform !== "android", "Android's back gesture");
      await serveSampleArt(page);
    });

    test("agree on a series page", async ({ page }) => {
      await expectPageBackAndGestureAgree(
        page,
        async () => {
          await openLibrary(page);
          await followInApp(page, SERIES_PAGE);
        },
        LIBRARY,
      );
    });

    test("agree on a volume page", async ({ page }) => {
      await expectPageBackAndGestureAgree(
        page,
        async () => {
          await openLibrary(page);
          await followInApp(page, VOLUME_SERIES_PAGE);
          await followInApp(page, VOLUME_PAGE);
        },
        VOLUME_SERIES_PAGE,
      );
    });

    test("agree on a Settings page", async ({ page }) => {
      await expectPageBackAndGestureAgree(
        page,
        async () => {
          await openLibrary(page);
          await followInApp(page, SETTINGS);
          await followInApp(page, APPEARANCE);
        },
        SETTINGS,
      );
    });
  },
);
