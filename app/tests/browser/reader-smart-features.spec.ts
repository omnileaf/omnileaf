import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  onPlatform,
  test,
} from "./fixtures.ts";
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

const DESKTOPS = ["linux", "macos", "windows"] as const;
const ANDROID_ROW_PX = 56;
const ANDROID_ROW_START = 16;
const ANDROID_WORDS_START = 56;
const ANDROID_ICON_GAP = 16;
const ANDROID_FADE = "0.38";

function turnAllOffRow(page: Page): Locator {
  return smartFeatures(page).getByRole("button", { name: "Turn all off" });
}

function allOffRow(page: Page): Locator {
  return smartFeatures(page).getByRole("button", { name: "All off" });
}

function powerIcon(row: Locator): Locator {
  return row.locator("[data-icon='power']");
}

async function expectSpansTheSwitches(page: Page, row: Locator): Promise<void> {
  const lastSwitch = await boxOf(
    featureSwitch(page, "Page previews while dragging the slider"),
  );
  const box = await boxOf(row);
  expect(box.x).toBe(lastSwitch.x);
  expect(box.width).toBe(lastSwitch.width);
}

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

  test.describe("on iOS", () => {
    test.use({ backend: { ...TIMED, appInfo: () => fakeAppInfo("ios") } });

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

    test("says All off once every smart feature is off", async ({ page }) => {
      await openReader(page);
      await openSettings(page);

      await smartFeatures(page)
        .getByRole("button", { name: "Turn all off" })
        .click();

      await expect(
        smartFeatures(page).getByRole("button", { name: "All off" }),
      ).toBeDisabled();
    });
  });

  test.describe("on an Android phone", { tag: "@native" }, () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test("ends the sheet's smart features with Turn all off as a full-width row", async ({
      page,
    }) => {
      await openReader(page);

      await openSettings(page);

      const row = turnAllOffRow(page);
      await expectSpansTheSwitches(page, row);
      expect(
        (await boxOf(row.getByText("Turn all off"))).x -
          ((await boxOf(powerIcon(row))).x +
            (await boxOf(powerIcon(row))).width),
      ).toBe(ANDROID_ICON_GAP);
    });

    test("fades the sheet's row to All off once everything is off", async ({
      page,
    }) => {
      await openReader(page);
      await openSettings(page);

      await turnAllOffRow(page).click();

      const row = allOffRow(page);
      await expect(row).toHaveAttribute("aria-disabled", "true");
      await expect(row).toBeFocused();
      await expect(powerIcon(row)).toHaveCSS("opacity", ANDROID_FADE);
    });
  });

  for (const desktop of ["macos", "windows"] as const) {
    test.describe(`on ${desktop}`, () => {
      test.use({ backend: { ...TIMED, appInfo: () => fakeAppInfo(desktop) } });

      test("offers no Turn all off in the reading settings", async ({
        page,
      }) => {
        await openReader(page);

        await openSettings(page);

        await expect(featureSwitch(page, "Show time left")).toBeVisible();
        await expect(smartFeatures(page).getByRole("button")).toHaveCount(0);
      });
    });
  }

  test("offers no Turn all off on the desktop", async ({ page }) => {
    await openReader(page);

    await openSettings(page);

    await expect(featureSwitch(page, "Show time left")).toBeVisible();
    await expect(smartFeatures(page).getByRole("button")).toHaveCount(0);
  });
});

test.describe("in Settings > Reader", () => {
  test("says the defaults give way to a series' own settings", async ({
    page,
  }) => {
    await page.goto("/settings/reading");

    await expect(
      page.getByText("For every series, unless changed in the reader."),
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

  test.describe("on iOS", () => {
    test.use(onPlatform("ios"));

    test("keeps every smart feature off once they are turned off at once", async ({
      page,
    }) => {
      await page.goto("/settings/reading");
      await smartFeatures(page)
        .getByRole("button", { name: "Turn all off" })
        .click();

      await page.reload();

      await expect(
        smartFeatures(page).getByRole("button", { name: "All off" }),
      ).toBeDisabled();
      expect(await storedFeatures(page)).toEqual({
        choosesReadingMode: false,
        learnsReadingSpeed: false,
        showsTimeLeft: false,
        showsBookSummary: false,
        autoScrollsAtMyPace: false,
        showsPagePreviews: false,
      });
    });
  });

  test.describe("on an Android phone", { tag: "@native" }, () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test("ends Smart features with Turn all off as a flush row, its icon at 16px and its words at 56px", async ({
      page,
    }) => {
      await page.goto("/settings/reading");

      const row = turnAllOffRow(page);
      await row.scrollIntoViewIfNeeded();

      await expectSpansTheSwitches(page, row);
      expect((await boxOf(row)).x).toBe(0);
      expect((await boxOf(row)).height).toBe(ANDROID_ROW_PX);
      expect((await boxOf(powerIcon(row))).x).toBe(ANDROID_ROW_START);
      expect((await boxOf(row.getByText("Turn all off"))).x).toBe(
        ANDROID_WORDS_START,
      );
    });

    test("fades the row to All off once everything is off", async ({
      page,
    }) => {
      await page.goto("/settings/reading");

      await turnAllOffRow(page).click();

      const row = allOffRow(page);
      await expect(row).toHaveAttribute("aria-disabled", "true");
      await expect(row).toBeFocused();
      await expect(row.getByText("All off")).toHaveCSS("opacity", ANDROID_FADE);
      await expect(powerIcon(row)).toHaveCSS("opacity", ANDROID_FADE);
    });
  });

  for (const desktop of DESKTOPS) {
    test.describe(`on ${desktop}`, () => {
      test.use(onPlatform(desktop));

      test("offers no Turn all off", async ({ page }) => {
        await page.goto("/settings/reading");

        await expect(featureSwitch(page, "Book summary")).toBeVisible();
        await expect(smartFeatures(page).getByRole("button")).toHaveCount(0);
      });
    });
  }

  test("turns the book summary off for every series", async ({ page }) => {
    await page.goto("/settings/reading");
    const summary = featureSwitch(page, "Book summary");
    await expect(summary).toHaveAccessibleDescription(
      "Time, pages and time per page on Up next and at the end of the series.",
    );

    await summary.click();

    expect(await storedFeatures(page)).toMatchObject({
      showsBookSummary: false,
    });
  });

  test("keeps the screen on for every series until told otherwise", async ({
    page,
  }) => {
    await page.goto("/settings/reading");
    const keepsOn = page.getByRole("switch", {
      name: "Keep the screen on while reading",
    });
    await expect(keepsOn).toBeChecked();
    await expect(keepsOn).toHaveAccessibleDescription("");

    await keepsOn.click();

    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      LOOK_KEY,
    );
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ keepsScreenOn: false });
  });
});
