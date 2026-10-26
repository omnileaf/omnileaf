import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";

import { boxOf, expect, test, tokenColour } from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const TABLET = { width: 820, height: 1180 };

type PhonePlatform = Extract<Platform, "ios" | "android">;

const BUTTON_HEIGHT = { ios: 34, android: 40 } satisfies Record<
  PhonePlatform,
  number
>;
const CONTINUE_HEIGHT = { ios: 50, android: 40 } satisfies Record<
  PhonePlatform,
  number
>;
const CONTINUE_COVER_WIDTH = { ios: 72, android: 64 } satisfies Record<
  PhonePlatform,
  number
>;
const DETAILS_CHEVRON = {
  ios: { closed: "chevron-right", open: "chevron-down" },
  android: { closed: "chevron-down", open: "chevron-up" },
} satisfies Record<PhonePlatform, { closed: string; open: string }>;

test.use({
  backend: new FakeShelf([{ state: "read" }, { state: "notStarted" }], {
    creators: [{ name: "Author A", role: "storyAndArt", seriesCount: 2 }],
  }).backend(),
});

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

function back(page: Page): Locator {
  return page.getByRole("link", { name: "Back to the library" });
}

function readingState(page: Page): Locator {
  return page.getByRole("button", { name: "Reading state: Reading" });
}

function markRead(page: Page): Locator {
  return page.getByRole("button", { name: `Mark ${SERIES_TITLE} read` });
}

function tags(page: Page): Locator {
  return page.getByRole("button", { name: `Tags for ${SERIES_TITLE}` });
}

function details(page: Page): Locator {
  return page.getByRole("button", { name: "Details" });
}

function continueCard(page: Page): Locator {
  return page.getByRole("region", { name: "Up next" });
}

function creatorLink(page: Page): Locator {
  return page
    .getByRole("region", { name: "About this series" })
    .getByRole("link", { name: "Author A" })
    .first();
}

test.describe(
  "the top of the series page on a phone",
  { tag: "@native" },
  () => {
    test("shows the way back as a circle holding only its chevron", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }

      await openSeries(page);
      const box = await boxOf(back(page));

      expect(box.width).toBeCloseTo(box.height, 0);
      await expect(back(page)).toHaveText("");
    });

    test("keeps the named way back on an iPad", async ({ page, platform }) => {
      if (platform !== "ios") {
        test.skip();
        return;
      }
      await page.setViewportSize(TABLET);

      await openSeries(page);

      await expect(back(page)).toHaveText("Library");
    });

    test("sets the series actions on the phone's own buttons", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }

      await openSeries(page);
      const state = await boxOf(readingState(page));
      const mark = await boxOf(markRead(page));
      const tag = await boxOf(tags(page));

      expect(state.height).toBeCloseTo(BUTTON_HEIGHT[platform], 0);
      expect(mark.height).toBeCloseTo(BUTTON_HEIGHT[platform], 0);
      expect(mark.width).toBeCloseTo(mark.height, 0);
      expect(tag.width).toBeCloseTo(tag.height, 0);
    });

    test("centres the actions on an iPhone and stretches the reading state on Android", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }

      await openSeries(page);
      const state = await boxOf(readingState(page));
      const mark = await boxOf(markRead(page));
      const pageWidth = page.viewportSize()?.width ?? 0;

      if (platform === "ios") {
        expect((state.x + mark.x + mark.width) / 2).toBeCloseTo(
          pageWidth / 2,
          0,
        );
        await expect(markRead(page)).toHaveCSS("border-top-width", "0px");
      } else {
        expect(state.width).toBeGreaterThan(pageWidth / 2);
        await expect(markRead(page)).toHaveCSS("border-top-width", "1px");
      }
    });

    test("keeps today's series actions on a tablet", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }
      await page.setViewportSize(TABLET);

      await openSeries(page);
      const state = await boxOf(readingState(page));

      expect(state.height).toBeGreaterThan(BUTTON_HEIGHT[platform]);
    });

    test("opens the details from a row with a chevron", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }
      const chevron = DETAILS_CHEVRON[platform];

      await openSeries(page);
      await expect(details(page).locator("[data-icon]").last()).toHaveAttribute(
        "data-icon",
        chevron.closed,
      );
      await details(page).click();

      await expect(details(page)).toHaveAttribute("aria-expanded", "true");
      await expect(details(page).locator("[data-icon]").last()).toHaveAttribute(
        "data-icon",
        chevron.open,
      );
    });

    test("keeps today's details button on a tablet", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }
      await page.setViewportSize(TABLET);

      await openSeries(page);

      await expect(details(page).locator("[data-icon]")).toHaveCount(0);
    });

    test("shows the cover on the continue card above the phone's own main button", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }

      await openSeries(page);
      const cover = await boxOf(
        continueCard(page).locator("[data-continue-cover]"),
      );
      const start = await boxOf(continueCard(page).getByRole("link"));

      expect(cover.width).toBeCloseTo(CONTINUE_COVER_WIDTH[platform], 0);
      expect(start.height).toBeCloseTo(CONTINUE_HEIGHT[platform], 0);
      expect(start.y).toBeGreaterThan(cover.y + cover.height);
    });

    test("keeps the continue card without its cover on a tablet", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }
      await page.setViewportSize(TABLET);

      await openSeries(page);

      await expect(continueCard(page)).toBeVisible();
      await expect(
        continueCard(page).locator("[data-continue-cover]"),
      ).toHaveCount(0);
    });

    test("colours a creator's name as the phone's own link", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }

      await openSeries(page);

      await expect(creatorLink(page)).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-plain"),
      );
      await expect(creatorLink(page)).toHaveCSS("text-decoration-line", "none");
    });

    test("keeps a creator's name underlined on a tablet", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }
      await page.setViewportSize(TABLET);

      await openSeries(page);

      await expect(creatorLink(page)).toHaveCSS(
        "text-decoration-line",
        "underline",
      );
    });
  },
);
