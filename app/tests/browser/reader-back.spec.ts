import type { JSHandle, Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  sampleBookId,
  sampleSeriesId,
} from "../../src/lib/sample-library/sample-library.ts";
import { NOTHING_BENEATH_MS } from "../../src/lib/reader/nothing-beneath.ts";
import { expect, test, testOnlyInItsWebview } from "./fixtures.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
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

const BOOK_THAT_CANNOT_BE_READ = sampleBookId(4, 3);
const SEARCH_WITH_QUERY = "/search?q=Sample";
const TABLET = { width: 820, height: 1180 };

async function pressLink(
  link: Locator,
  platform: Platform | undefined,
): Promise<void> {
  if (platform !== "ios") {
    await link.click();
    return;
  }
  const touch = { pointerType: "touch", pointerId: 7, isPrimary: true };
  await link.dispatchEvent("pointerdown", touch);
  await link.dispatchEvent("pointerup", touch);
  await link.dispatchEvent("click");
}

async function countHistoryBacks(
  page: Page,
): Promise<JSHandle<{ count: number }>> {
  return page.evaluateHandle(() => {
    const backs = { count: 0 };
    const goBack = history.back.bind(history);
    history.back = () => {
      backs.count += 1;
      goBack();
    };
    return backs;
  });
}

async function openFrom(
  page: Page,
  platform: Platform | undefined,
  origin: string,
): Promise<void> {
  await openLibrary(page);
  await followInApp(page, origin);
  await pressLink(
    page.locator(`a[href="${READER}"]`).filter({ visible: true }).first(),
    platform,
  );
  await expect(page).toHaveURL(READER);
}

function openFromHistory(
  page: Page,
  platform: Platform | undefined,
): Promise<void> {
  return openFrom(page, platform, HISTORY);
}

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

    test("still goes back to History after a visit to the series page and back", async ({
      page,
    }) => {
      await openLibrary(page);
      await followInApp(page, HISTORY);
      await page
        .locator(`a[href="${READER}"]`)
        .filter({ visible: true })
        .first()
        .click();
      await expect(page).toHaveURL(READER);
      await followInApp(page, SERIES_PAGE);
      await page.goBack();
      await expect(page).toHaveURL(READER);

      await expectBackAndGestureAgree(page, HISTORY, "Back to History");
    });

    test("takes Back and the gesture to History after jumping to another book", async ({
      page,
    }) => {
      await openFrom(page, "android", HISTORY);
      await page.keyboard.press("g");
      await page
        .getByRole("dialog")
        .locator(`a[href="${NEXT_READER}"]`)
        .click();
      await expect(page).toHaveURL(NEXT_READER);

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

test.describe(
  "going back from the reader on every platform",
  { tag: "@native" },
  () => {
    test.use({ backend: sampleLibraryOn("linux") });

    test.beforeEach(async ({ page }) => {
      await serveSampleArt(page);
    });

    test("goes back to History from a book returned to through its series and another book", async ({
      page,
      platform,
    }) => {
      await openFromHistory(page, platform);
      await followInApp(page, SERIES_PAGE);
      await pressLink(
        page.locator(`a[href="${READER}"]`).filter({ visible: true }).first(),
        platform,
      );
      await expect(page).toHaveURL(READER);
      await expect(
        page.getByRole("link", { name: `Back to ${SERIES_TITLE}` }),
      ).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(SERIES_PAGE);
      await page.goBack();
      await expect(page).toHaveURL(READER);

      const back = page.getByRole("link", { name: "Back to History" });
      await expect(back).toHaveAttribute("href", HISTORY);
      await pressLink(back, platform);

      await expect(page).toHaveURL(HISTORY);
    });

    test("goes back one page when Back is activated twice in a row", async ({
      page,
      platform,
    }) => {
      await openFromHistory(page, platform);
      const backs = await countHistoryBacks(page);
      const back = page.getByRole("link", { name: "Back to History" });

      await back.evaluate((link: HTMLElement) => {
        link.click();
        link.click();
      });

      await expect(page).toHaveURL(HISTORY);
      expect(await backs.evaluate(({ count }) => count)).toBe(1);
    });

    test("goes back one page when Escape is pressed twice in a row", async ({
      page,
      platform,
    }) => {
      await openFromHistory(page, platform);
      const backs = await countHistoryBacks(page);

      await Promise.all([
        page.keyboard.press("Escape"),
        page.keyboard.press("Escape"),
      ]);

      await expect(page).toHaveURL(HISTORY);
      expect(await backs.evaluate(({ count }) => count)).toBe(1);
    });

    test("goes back to History from the end of a book", async ({
      page,
      platform,
    }) => {
      await openFromHistory(page, platform);
      await page.keyboard.press("End");
      const finished = page.getByRole("heading", {
        level: 2,
        name: / finished$/,
      });
      await expect(async () => {
        await page.keyboard.press("ArrowRight");
        await expect(finished).toBeVisible({ timeout: 1000 });
      }).toPass();

      const backs = await countHistoryBacks(page);
      const back = page
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByRole("link", { name: "Back to History" });
      await pressLink(back, platform);

      await expect(page).toHaveURL(HISTORY);
      expect(await backs.evaluate(({ count }) => count)).toBe(1);
    });

    test("goes back to the search results with their query", async ({
      page,
      platform,
    }) => {
      await page.goto(SEARCH_WITH_QUERY);
      await expect(
        page.getByRole("heading", { level: 1, name: "Search" }),
      ).toBeAttached();
      await followInApp(page, READER);

      const backs = await countHistoryBacks(page);
      await pressLink(
        page.getByRole("link", { name: "Back", exact: true }),
        platform,
      );

      await expect(page).toHaveURL(SEARCH_WITH_QUERY);
      expect(await backs.evaluate(({ count }) => count)).toBe(1);
    });

    test("goes back to the book another book was opened over", async ({
      page,
      platform,
    }) => {
      await openFromHistory(page, platform);
      await followInApp(page, NEXT_READER);

      const back = page.getByRole("link", { name: "Back", exact: true });
      await expect(back).toHaveAttribute("href", READER);
      await pressLink(back, platform);

      await expect(page).toHaveURL(READER);
    });

    test("tries again when going back starts no navigation", async ({
      page,
      platform,
    }) => {
      await page.clock.install();
      await openFromHistory(page, platform);
      await page.evaluate(() => {
        const goBack = history.back.bind(history);
        history.back = () => {
          history.back = goBack;
          const state: unknown = history.state;
          dispatchEvent(new PopStateEvent("popstate", { state }));
        };
      });
      const back = page.getByRole("link", { name: "Back to History" });
      await pressLink(back, platform);
      await page.clock.runFor(1);

      await pressLink(back, platform);

      await expect(page).toHaveURL(HISTORY);
    });

    test("puts the series page in the reader's place when nothing is beneath it", async ({
      page,
      platform,
    }) => {
      await page.clock.install();
      await openFromHistory(page, platform);
      await page.evaluate(() => {
        history.back = () => undefined;
      });

      await pressLink(
        page.getByRole("link", { name: "Back to History" }),
        platform,
      );
      await page.clock.runFor(NOTHING_BENEATH_MS);

      await expect(page).toHaveURL(SERIES_PAGE);
    });

    test("names the Back to History row in the keyboard shortcuts", async ({
      page,
      platform,
    }) => {
      await openFromHistory(page, platform);

      await page.keyboard.press("?");

      await expect(
        page.getByRole("dialog").getByText("Back to History", { exact: true }),
      ).toBeVisible();
    });
  },
);

test.describe(
  "going back from the reader on an iPad",
  { tag: "@native" },
  () => {
    testOnlyInItsWebview("ios");

    test.use({
      backend: sampleLibraryOn("ios"),
      platform: "ios",
      viewport: TABLET,
      hasTouch: true,
      isMobile: true,
    });

    test.beforeEach(async ({ page }) => {
      await serveSampleArt(page);
    });

    test("names the series beside Back when the book was opened from its series page", async ({
      page,
      platform,
    }) => {
      await openFrom(page, platform, SERIES_PAGE);

      await expect(
        page
          .getByRole("link", { name: `Back to ${SERIES_TITLE}`, exact: true })
          .getByText(SERIES_TITLE),
      ).toBeVisible();
    });

    test("leaves the series name out of Back when the book was opened from History", async ({
      page,
      platform,
    }) => {
      await openFromHistory(page, platform);

      await expect(
        page.getByRole("link", { name: "Back to History", exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("link", { name: "Back to History", exact: true })
          .getByText(SERIES_TITLE),
      ).toHaveCount(0);
    });
  },
);

const SAMPLE_BACKEND = sampleLibraryOn("linux");

function refusing(failure: CommandFailure): FakeBackend {
  return {
    ...SAMPLE_BACKEND,
    openBook: (id, undecodable) => {
      if (id === BOOK_THAT_CANNOT_BE_READ) {
        throw failure;
      }
      return SAMPLE_BACKEND.openBook(id, undecodable);
    },
    bookFile: () => ({ name: "Sample Series 04 v03.cbr", fileType: "cbr" }),
  };
}

test.describe(
  "going back from a book that cannot be opened",
  { tag: "@native" },
  () => {
    test.describe("because its type is unsupported", () => {
      test.use({
        backend: refusing(
          new CommandFailure({
            code: "bookTypeUnsupported",
            message: "the book's file is of a type this version can't read",
          }),
        ),
      });

      test("goes back to History", async ({ page, platform }) => {
        await serveSampleArt(page);
        await openFromHistory(page, platform);

        await pressLink(
          page.getByRole("link", { name: "Back to History" }),
          platform,
        );

        await expect(page).toHaveURL(HISTORY);
      });
    });

    test.describe("because its file is missing", () => {
      test.use({
        backend: refusing(
          new CommandFailure({
            code: "bookNotFound",
            message: "the book's file is not where it was",
          }),
        ),
      });

      test("goes back to History from the bar", async ({ page, platform }) => {
        await serveSampleArt(page);
        await openFromHistory(page, platform);

        await pressLink(
          page.getByRole("link", { name: "Back to History" }).first(),
          platform,
        );

        await expect(page).toHaveURL(HISTORY);
      });

      test("goes back to History from its button", async ({
        page,
        platform,
      }) => {
        await serveSampleArt(page);
        await openFromHistory(page, platform);

        await pressLink(
          page.getByRole("link", { name: "Back to History" }).last(),
          platform,
        );

        await expect(page).toHaveURL(HISTORY);
      });
    });
  },
);
