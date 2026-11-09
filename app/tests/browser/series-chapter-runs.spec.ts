import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";
import { chapters, SectionShelf, volumes } from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const CHAPTER_COUNT = 30;
const EVERY_CHAPTER = chapters(
  ...Array.from({ length: CHAPTER_COUNT }, (_, index) => index + 1),
);
const ANDROID_PHONE = {
  platform: "android",
  viewport: { width: 360, height: 800 },
} as const;
const TURNS = [
  {
    viewport: { width: 700, height: 360 },
    sort: "Sort: In order",
    first: "chapter 01",
  },
  {
    viewport: ANDROID_PHONE.viewport,
    sort: "Sort: Last first",
    first: "chapter 30",
  },
] as const;
const IPHONE = {
  platform: "ios",
  viewport: { width: 390, height: 844 },
} as const;

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

function sort(page: Page): Locator {
  return page.getByRole("button", { name: /^Sort/ });
}

function bookLinks(page: Page): Locator {
  return page.getByRole("list", { name: "Books" }).getByRole("link");
}

test.describe(
  "a series of chapters only on an Android phone",
  { tag: "@native" },
  () => {
    test.use({
      ...ANDROID_PHONE,
      backend: new SectionShelf(EVERY_CHAPTER).backend(),
    });

    test("lists the newest chapter first", async ({ page }) => {
      await openSeries(page);

      await expect(sort(page)).toHaveAccessibleName("Sort: Last first");
      await expect(bookLinks(page).first()).toContainText("chapter 30");
    });

    test("keeps In order once it is chosen, across a change of Show", async ({
      page,
    }) => {
      await openSeries(page);

      await sort(page).click();
      await page.getByRole("menuitemradio", { name: "In order" }).click();
      await page
        .getByRole("radiogroup", { name: "Show" })
        .getByRole("radio", { name: "Unread" })
        .click();

      await expect(sort(page)).toHaveAccessibleName("Sort: In order");
      await expect(bookLinks(page).first()).toContainText("chapter 01");
    });

    test("lists the rows in the order Sort names as the phone turns past the compact width and back", async ({
      page,
    }) => {
      await openSeries(page);

      for (const turn of TURNS) {
        await page.setViewportSize(turn.viewport);
        await bookList(page).scrollIntoViewIfNeeded();

        await expect(sort(page)).toHaveAccessibleName(turn.sort);
        await expect(bookLinks(page).first()).toContainText(turn.first);
      }
    });
  },
);

test.describe(
  "a series of volumes only on an Android phone",
  { tag: "@native" },
  () => {
    test.use({
      ...ANDROID_PHONE,
      backend: new SectionShelf(volumes(1, 2, 3)).backend(),
    });

    test("lists the volumes in order", async ({ page }) => {
      await openSeries(page);

      await expect(sort(page)).toHaveAccessibleName("Sort: In order");
    });
  },
);

test.describe(
  "a series of chapters only on an iPhone",
  { tag: "@native" },
  () => {
    test.use({ ...IPHONE, backend: new SectionShelf(EVERY_CHAPTER).backend() });

    test("lists the chapters in order", async ({ page }) => {
      await openSeries(page);

      await expect(sort(page)).toHaveAccessibleName("Sort: In order");
      await expect(bookLinks(page).first()).toContainText("chapter 01");
    });
  },
);
