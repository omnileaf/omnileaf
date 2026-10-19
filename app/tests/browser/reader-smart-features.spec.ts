import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const FEATURES_KEY = "omnileaf.smartFeatures";
const LOOK_KEY = "omnileaf.readerSettings.all";
const TIME_LEFT = "About 4 min left in this chapter";
const STARTED_ON_14 = {
  reading: { state: "started", page: 14 },
  startPage: 13,
} as const;

const TIMED: FakeBackend = {
  ...readerBackend(DEFAULT_BACKEND, STARTED_ON_14),
  openBook: () => ({ ...readerBook(STARTED_ON_14), secondsPerPage: 15 }),
};

function smartFeatures(page: Page): Locator {
  return page.getByRole("region", { name: "Smart features" });
}

function featureSwitch(page: Page, name: string): Locator {
  return smartFeatures(page).getByRole("switch", { name });
}

async function storedFeatures(page: Page): Promise<unknown> {
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    FEATURES_KEY,
  );
  return JSON.parse(stored ?? "{}");
}

test.describe("in the reader", () => {
  test.use({ backend: TIMED });

  async function openReader(page: Page, features: object = {}): Promise<void> {
    await page.addInitScript(
      ({ key, value }) => {
        localStorage.setItem("omnileaf.readerGuide.leftToRight", "seen");
        localStorage.setItem(key, value);
      },
      { key: FEATURES_KEY, value: JSON.stringify(features) },
    );
    await servePages(page);
    await page.goto(`/read/${BOOK_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
    ).toBeAttached();
  }

  async function openSettings(page: Page): Promise<void> {
    await page
      .getByRole("button", { name: "Reading settings", exact: true })
      .click();
    await smartFeatures(page).scrollIntoViewIfNeeded();
  }

  test("hides the time left once Show time left is turned off", async ({
    page,
  }) => {
    await openReader(page);
    await expect(page.getByText(TIME_LEFT)).toBeAttached();
    await openSettings(page);

    await featureSwitch(page, "Show time left").click();

    await expect(page.getByText(TIME_LEFT)).toHaveCount(0);
    expect(await storedFeatures(page)).toMatchObject({ showsTimeLeft: false });
  });

  test("turns Show time left off with it while the reading speed isn't learned", async ({
    page,
  }) => {
    await openReader(page);
    await openSettings(page);

    await featureSwitch(page, "Learn my reading speed").click();

    const timeLeft = featureSwitch(page, "Show time left");
    await expect(timeLeft).toBeDisabled();
    await expect(timeLeft).not.toBeChecked();
    await expect(timeLeft).toHaveAccessibleDescription(
      "Needs Learn my reading speed.",
    );
    await expect(page.getByText(TIME_LEFT)).toHaveCount(0);
  });

  test("shows no page previews while the slider is dragged once they're turned off", async ({
    page,
  }) => {
    await openReader(page, { showsPagePreviews: false });
    const slider = page.getByRole("slider", { name: "Page" });
    const track = await slider.boundingBox();
    if (track === null) {
      throw new Error("the slider is not on screen");
    }
    const y = track.y + track.height / 2;

    await page.mouse.move(track.x + 2, y);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width / 2, y, { steps: 4 });

    await expect(slider).not.toHaveValue("14");
    await expect(page.getByRole("list", { name: "Nearby pages" })).toHaveCount(
      0,
    );
    await page.mouse.up();
  });

  test("turns every smart feature off at once", async ({ page }) => {
    await openReader(page);
    await openSettings(page);

    await smartFeatures(page)
      .getByRole("button", { name: "Turn all off" })
      .click();

    for (const name of [
      "Learn my reading speed",
      "Show time left",
      "Page previews while dragging the slider",
    ]) {
      await expect(featureSwitch(page, name)).not.toBeChecked();
    }
  });
});

test.describe("in Settings › Reader", () => {
  test("says the defaults give way to a series' own settings", async ({
    page,
  }) => {
    await page.goto("/settings/reading");

    await expect(
      page.getByText(
        "Defaults for every series without its own. A series’ own settings, chosen in the reader, win.",
      ),
    ).toBeVisible();
  });

  test("turns a smart feature off for every series", async ({ page }) => {
    await page.goto("/settings/reading");

    await featureSwitch(
      page,
      "Page previews while dragging the slider",
    ).click();

    expect(await storedFeatures(page)).toMatchObject({
      showsPagePreviews: false,
    });
  });

  test("keeps the screen on for every series until told otherwise", async ({
    page,
  }) => {
    await page.goto("/settings/reading");
    const keepsOn = page.getByRole("switch", { name: "Keep the screen on" });
    await expect(keepsOn).toBeChecked();
    await expect(keepsOn).toHaveAccessibleDescription("While a book is open.");

    await keepsOn.click();

    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      LOOK_KEY,
    );
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ keepsScreenOn: false });
  });
});
