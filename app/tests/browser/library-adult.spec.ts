import type { Locator, Page } from "@playwright/test";

import type { AdultContent } from "../../src/lib/ipc/bindings.ts";
import { NEW_ADULT_CONTENT } from "../../src/lib/library/adult-content.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, fakeAppInfo, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6).map((series, index) => ({
  ...series,
  isAdult: index === 1,
}));
const ADULT_TITLE = LIBRARY[1]?.title ?? "";
const BLURRED: AdultContent = { ...NEW_ADULT_CONTENT, treatment: "blur" };

let stored: AdultContent = BLURRED;

function backendOn(platform: "linux" | "android"): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo(platform),
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryAdultContent: () => stored,
  };
}

test.use({ backend: backendOn("linux") });

test.beforeEach(() => {
  stored = BLURRED;
});

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function showCover(page: Page): Locator {
  return seriesList(page).getByRole("button", {
    name: `Show the cover of ${ADULT_TITLE}`,
  });
}

test("blurs an 18+ series' cover until it's clicked, then shows it in place", async ({
  page,
}) => {
  await page.goto("/");
  await expect(showCover(page)).toBeVisible();
  await expect(showCover(page)).toContainText("18+");

  await showCover(page).click();

  await expect(showCover(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(
    seriesList(page).getByRole("link", { name: new RegExp(ADULT_TITLE) }),
  ).toBeVisible();
});

test("says Click to show under a mouse", async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.hasTouch === true, "touch says Tap");
  await page.goto("/");

  await expect(showCover(page)).toContainText("Click to show");
});

test("leaves the 18+ series' badges off its blurred cover", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    showCover(page).getByRole("img", { name: /unread/ }),
  ).toHaveCount(0);
});

test("shows every cover while 18+ content is shown", async ({ page }) => {
  stored = NEW_ADULT_CONTENT;
  await page.goto("/");
  await expect(seriesList(page).getByRole("link").first()).toBeVisible();

  await expect(showCover(page)).toHaveCount(0);
});

test("still starts selecting from a blurred cover with Ctrl-click", async ({
  page,
}) => {
  await page.goto("/");

  await showCover(page).click({ modifiers: ["ControlOrMeta"] });

  await expect(
    seriesList(page).getByRole("checkbox", { name: ADULT_TITLE }),
  ).toBeChecked();
});

test.describe("on a phone", () => {
  test.use({ backend: backendOn("android") });

  test("says Tap to show", async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.hasTouch !== true, "a mouse says Click");
    await page.goto("/");

    await expect(showCover(page)).toContainText("Tap to show");
  });
});
