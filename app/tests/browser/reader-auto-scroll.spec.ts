import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  onPlatform,
  setTextScale,
  test,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  NOT_STARTED,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const LOOK_KEY = "omnileaf.readerSettings.all";
const HALF_A_MINUTE_MS = 30_000;
const SIX_SECONDS_MS = 6000;
const FEW_SECONDS_MS = 2000;
const CLOSE_PX = 8;
const PAUSE_AHEAD_MS = 500;
const CONTROLS_GONE_MS = 4000;
const TOOLBAR_TUCKS_MS = 3500;
const ANDROID_ROUND_BUTTON_PX = 48;
const NARROWEST_WIDTHS = [360, 375] as const;
const NARROW_HEIGHT = 800;
const SMALLEST_IPHONE_WIDTH = 375;
const VERY_LARGE_TEXT_SCALE = 3;
const ANDROID_SPEED_BUTTON_PX = 40;

function tallPages(secondsPerPage: number | null): FakeBackend {
  return {
    ...readerBackend(DEFAULT_BACKEND),
    openBook: () => {
      const book = readerBook(NOT_STARTED);
      return {
        ...book,
        secondsPerPage,
        pages: book.pages.map((page) => ({
          ...page,
          size: { width: 800, height: 2400 },
        })),
      };
    },
  };
}

async function openStrip(page: Page, look: object = {}): Promise<void> {
  await page.clock.install();
  await page.addInitScript(
    ({ series, lookKey, lookValue }) => {
      localStorage.setItem(`omnileaf.stripFound.${series}`, "seen");
      localStorage.setItem("omnileaf.readerGuide.strip", "seen");
      localStorage.setItem(lookKey, lookValue);
    },
    {
      series: BOOK_SERIES_ID,
      lookKey: LOOK_KEY,
      lookValue: JSON.stringify(look),
    },
  );
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(page.locator("[data-strip]")).toBeVisible();
}

function bar(page: Page): Locator {
  return page.getByRole("region", { name: "Auto scroll" });
}

async function startAutoScroll(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show the controls" }).click();
  await page.getByRole("button", { name: "Start auto scroll" }).click();
  await expect(bar(page)).toBeVisible();
}

async function closeReadingSettings(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /^(Done|Close reading settings)$/ })
    .click();
}

/** Holds the page's clock still, so only the time the test runs on moves the strip. */
async function holdTime(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + PAUSE_AHEAD_MS);
}

async function scrollTopOf(page: Page): Promise<number> {
  return page.locator("[data-strip]").evaluate((element) => element.scrollTop);
}

async function pageHeightOf(page: Page): Promise<number> {
  return page
    .locator("[data-strip]")
    .getByRole("img", { name: "Page 1", exact: true })
    .evaluate((element) => element.getBoundingClientRect().height);
}

async function leftEdgesOf(parts: readonly Locator[]): Promise<number[]> {
  return Promise.all(parts.map(async (part) => (await boxOf(part)).x));
}

interface Span {
  readonly start: number;
  readonly end: number;
}

async function spansOf(parts: readonly Locator[]): Promise<Span[]> {
  return Promise.all(
    parts.map(async (part) => {
      const { x, width } = await boxOf(part);
      return { start: x, end: x + width };
    }),
  );
}

async function textSpanOf(part: Locator): Promise<Span> {
  return part.evaluate((element) => {
    const text = document.createRange();
    text.selectNodeContents(element);
    const { left, right } = text.getBoundingClientRect();
    return { start: left, end: right };
  });
}

function overlapping(spans: readonly Span[]): Span[][] {
  return spans.flatMap((span, index) => {
    const next = spans[index + 1];
    return next !== undefined && span.end > next.start ? [[span, next]] : [];
  });
}

function ascending(edges: readonly number[]): number[] {
  return edges.toSorted((left, right) => left - right);
}

async function sizesOf(parts: readonly Locator[]): Promise<number[][]> {
  return Promise.all(
    parts.map(async (part) => {
      const { width, height } = await boxOf(part);
      return [width, height];
    }),
  );
}

test.describe("at a set speed", () => {
  test.use({ backend: tallPages(null) });

  test("scrolls a fifth of a page in six seconds at 2 pages a minute", async ({
    page,
  }) => {
    await openStrip(page);
    const height = await pageHeightOf(page);
    await startAutoScroll(page);
    await expect(bar(page)).toContainText("2 pages a minute");
    await holdTime(page);
    const start = await scrollTopOf(page);

    await page.clock.runFor(SIX_SECONDS_MS);

    expect(
      Math.abs((await scrollTopOf(page)) - start - height / 5),
    ).toBeLessThan(CLOSE_PX);
  });

  test("pauses on a touch of the page, until Play", async ({ page }) => {
    await openStrip(page);
    await startAutoScroll(page);

    await page.getByRole("button", { name: "Scroll down" }).click();

    await expect(bar(page)).toContainText("Paused");
    const paused = await scrollTopOf(page);
    await page.clock.runFor(FEW_SECONDS_MS);
    expect(await scrollTopOf(page)).toBe(paused);
    await bar(page).getByRole("button", { name: "Play" }).click();
    await page.clock.runFor(FEW_SECONDS_MS);
    expect(await scrollTopOf(page)).toBeGreaterThan(paused);
  });

  test("pauses and goes on with Space", async ({ page }) => {
    await openStrip(page);
    await startAutoScroll(page);

    await page.keyboard.press(" ");
    await expect(bar(page)).toContainText("Paused");
    await expect(bar(page)).toContainText("Space resumes");
    await page.keyboard.press(" ");

    await expect(bar(page)).toContainText("Space pauses");
  });

  test("goes faster and slower half a page a minute at a time", async ({
    page,
  }) => {
    await openStrip(page);
    await startAutoScroll(page);

    await bar(page).getByRole("button", { name: "Faster" }).click();
    await expect(bar(page)).toContainText("2.5 pages a minute");
    await bar(page).getByRole("button", { name: "Slower" }).click();
    await bar(page).getByRole("button", { name: "Slower" }).click();

    await expect(bar(page)).toContainText("1.5 pages a minute");
    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      LOOK_KEY,
    );
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ pagesPerMinute: 1.5 });
  });

  test("keeps scrolling with reduced motion, since you started it", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStrip(page);
    await startAutoScroll(page);
    const start = await scrollTopOf(page);

    await page.clock.runFor(FEW_SECONDS_MS);

    expect(await scrollTopOf(page)).toBeGreaterThan(start);
  });

  test("pauses at the end of a book", async ({ page }) => {
    await openStrip(page);
    await page.locator("[data-strip]").evaluate((element) => {
      element.scrollTop = element.scrollHeight - element.clientHeight - 20;
    });
    await startAutoScroll(page);

    await page.clock.runFor(HALF_A_MINUTE_MS);

    await expect(bar(page)).toContainText("Paused");
  });

  test("stops at Stop auto scroll and puts its toolbar away", async ({
    page,
  }) => {
    await openStrip(page);
    await startAutoScroll(page);

    await bar(page).getByRole("button", { name: "Stop auto scroll" }).click();

    await expect(bar(page)).toHaveCount(0);
    const stopped = await scrollTopOf(page);
    await page.clock.runFor(FEW_SECONDS_MS);
    expect(await scrollTopOf(page)).toBe(stopped);
    await expect(page.locator("h1")).toBeFocused();
  });

  for (const width of NARROWEST_WIDTHS) {
    test(`fits its readout and buttons side by side in a ${String(width)} px window`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: NARROW_HEIGHT });
      await openStrip(page);

      await startAutoScroll(page);

      const spans = [
        await textSpanOf(
          bar(page).getByText("2 pages a minute", { exact: true }),
        ),
        ...(await spansOf([
          bar(page).getByRole("button", { name: "Pause" }),
          bar(page).getByRole("button", { name: "Slower" }),
          bar(page).getByRole("button", { name: "Faster" }),
          bar(page).getByRole("button", { name: "Stop auto scroll" }),
        ])),
      ];
      expect(overlapping(spans)).toEqual([]);
    });
  }

  test("keeps its readout clear of Pause with very large text", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: SMALLEST_IPHONE_WIDTH,
      height: NARROW_HEIGHT,
    });
    await setTextScale(page, VERY_LARGE_TEXT_SCALE);
    await openStrip(page);

    await startAutoScroll(page);

    const spans = [
      await textSpanOf(
        bar(page).getByText("2 pages a minute", { exact: true }),
      ),
      ...(await spansOf([bar(page).getByRole("button", { name: "Pause" })])),
    ];
    expect(overlapping(spans)).toEqual([]);
  });

  test("keeps its toolbar up while it runs", async ({ page }) => {
    await openStrip(page);
    await startAutoScroll(page);

    await page.clock.runFor(SIX_SECONDS_MS);

    await expect(bar(page)).toBeVisible();
  });

  test("stops when the reader leaves the long strip", async ({ page }) => {
    await openStrip(page);
    await startAutoScroll(page);
    await page.keyboard.press("m");
    await page
      .getByRole("button", { name: "Reading settings", exact: true })
      .click();

    await page
      .getByRole("combobox", { name: "Reading mode" })
      .selectOption({ label: "Left to right" });
    await closeReadingSettings(page);
    await page.clock.runFor(CONTROLS_GONE_MS);

    await expect(
      page.getByRole("button", { name: "Show the controls" }),
    ).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
  });
});

test.describe(
  "the Android phone's floating toolbar",
  { tag: "@native" },
  () => {
    test.use({ backend: tallPages(null) });

    test("leads with the round Pause, then the readout, then Slower and Faster", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);

      await startAutoScroll(page);

      const lefts = await leftEdgesOf([
        bar(page).getByRole("button", { name: "Pause" }),
        bar(page).getByText("2 pages a minute", { exact: true }),
        bar(page).getByRole("button", { name: "Slower" }),
        bar(page).getByRole("button", { name: "Faster" }),
      ]);
      expect(lefts).toEqual(ascending(lefts));
    });

    test("keeps the round button leading, turned to Play, once a touch pauses it", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);
      await startAutoScroll(page);

      await page.getByRole("button", { name: "Scroll down" }).click();

      const lefts = await leftEdgesOf([
        bar(page).getByRole("button", { name: "Play" }),
        bar(page).getByText("Paused", { exact: true }),
      ]);
      expect(lefts).toEqual(ascending(lefts));
    });

    test("draws the round button at 48 dp and Slower and Faster at 40 dp", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);

      await startAutoScroll(page);

      expect(
        await sizesOf([
          bar(page).getByRole("button", { name: "Pause" }),
          bar(page).getByRole("button", { name: "Slower" }),
          bar(page).getByRole("button", { name: "Faster" }),
        ]),
      ).toEqual([
        [ANDROID_ROUND_BUTTON_PX, ANDROID_ROUND_BUTTON_PX],
        [ANDROID_SPEED_BUTTON_PX, ANDROID_SPEED_BUTTON_PX],
        [ANDROID_SPEED_BUTTON_PX, ANDROID_SPEED_BUTTON_PX],
      ]);
    });

    test("tucks the toolbar away three seconds after auto scroll starts", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);
      await startAutoScroll(page);

      await page.clock.runFor(TOOLBAR_TUCKS_MS);

      await expect(bar(page)).toBeHidden();
    });

    test("tucks the toolbar away three seconds after its last touch, not before", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);
      await startAutoScroll(page);
      await page.clock.runFor(FEW_SECONDS_MS);

      await bar(page).getByRole("button", { name: "Faster" }).click();
      await page.clock.runFor(FEW_SECONDS_MS);

      await expect(bar(page)).toBeVisible();
      await page.clock.runFor(FEW_SECONDS_MS);
      await expect(bar(page)).toBeHidden();
    });

    test("brings the toolbar back, paused, at a touch of the page and keeps it up", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);
      await startAutoScroll(page);
      await page.clock.runFor(TOOLBAR_TUCKS_MS);
      await expect(bar(page)).toBeHidden();

      await page.getByRole("button", { name: "Scroll down" }).click();
      await page.clock.runFor(TOOLBAR_TUCKS_MS);

      await expect(bar(page)).toBeVisible();
      await expect(bar(page)).toContainText("Paused");
    });

    test("brings the toolbar back, paused, when Scroll down is pressed with a key", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);
      await startAutoScroll(page);
      await page.clock.runFor(TOOLBAR_TUCKS_MS);
      await expect(bar(page)).toBeHidden();

      await page.getByRole("button", { name: "Scroll down" }).focus();
      await page.keyboard.press("Enter");

      await expect(bar(page)).toBeVisible();
      await expect(bar(page)).toContainText("Paused");
    });

    test("keeps the toolbar up while a key has focused it, and tucks it away three seconds after focus leaves", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);
      await startAutoScroll(page);
      await bar(page).getByRole("button", { name: "Faster" }).focus();
      await page.keyboard.press("Tab");
      const stop = bar(page).getByRole("button", { name: "Stop auto scroll" });
      await expect(stop).toBeFocused();

      await page.clock.runFor(TOOLBAR_TUCKS_MS);

      await expect(bar(page)).toBeVisible();
      await expect(stop).toBeFocused();
      await page.locator("h1").focus();
      await page.clock.runFor(TOOLBAR_TUCKS_MS);
      await expect(bar(page)).toBeHidden();
    });

    test("leaves no focus inside the toolbar once it tucks away after a tap", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);
      await startAutoScroll(page);
      await bar(page).getByRole("button", { name: "Faster" }).click();

      await page.clock.runFor(TOOLBAR_TUCKS_MS);

      await expect(bar(page)).toBeHidden();
      await expect(page.locator("h1")).toBeFocused();
    });

    test("tucks the toolbar away again three seconds after Play", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);
      await startAutoScroll(page);
      await page.clock.runFor(TOOLBAR_TUCKS_MS);
      await page.getByRole("button", { name: "Scroll down" }).click();

      await bar(page).getByRole("button", { name: "Play" }).click();
      await page.clock.runFor(FEW_SECONDS_MS);

      await expect(bar(page)).toBeVisible();
      await page.clock.runFor(FEW_SECONDS_MS);
      await expect(bar(page)).toBeHidden();
    });

    test("ends with Stop auto scroll", async ({ page, platform }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);

      await startAutoScroll(page);

      const lefts = await leftEdgesOf([
        bar(page).getByRole("button", { name: "Faster" }),
        bar(page).getByRole("button", { name: "Stop auto scroll" }),
      ]);
      expect(lefts).toEqual(ascending(lefts));
    });
  },
);

test.describe("once the library knows the reading speed", () => {
  test.use({ backend: tallPages(60) });

  test("scrolls at my pace once it's chosen", async ({ page }) => {
    await openStrip(page, { autoScrollSpeed: "myPace" });

    await startAutoScroll(page);

    await expect(bar(page)).toContainText("Your pace");
    await expect(bar(page)).not.toContainText("pages a minute");
  });
});

test.describe("on an Android phone", () => {
  test.use({
    backend: {
      ...onPlatform("android").backend,
      openBook: tallPages(60).openBook,
    },
  });

  test("says my pace's speed while it runs, and to tap Play once paused", async ({
    page,
  }) => {
    await openStrip(page, { autoScrollSpeed: "myPace" });
    await startAutoScroll(page);
    await expect(bar(page)).toContainText("About 1 page a minute");

    await page.getByRole("button", { name: "Scroll down" }).click();

    await expect(bar(page)).toContainText("Tap Play to resume");
  });
});

test.describe("on an iPhone", () => {
  test.use({
    backend: {
      ...onPlatform("ios").backend,
      openBook: tallPages(null).openBook,
    },
  });

  test("keeps its toolbar up while it runs", async ({ page }) => {
    await openStrip(page);
    await startAutoScroll(page);

    await page.clock.runFor(SIX_SECONDS_MS);

    await expect(bar(page)).toBeVisible();
  });
});

test.describe("its settings", () => {
  test.use({ backend: tallPages(null) });

  test("sets the speed and the pause at the end of a book in the long strip's Reading settings", async ({
    page,
  }) => {
    await openStrip(page);
    await page.getByRole("button", { name: "Show the controls" }).click();
    await page
      .getByRole("button", { name: "Reading settings", exact: true })
      .click();
    const autoScroll = page.getByRole("region", { name: "Auto scroll" });

    await expect(
      autoScroll.getByText(
        "Keeps scrolling with reduced motion on, since you started it.",
      ),
    ).toBeVisible();
    await expect(
      autoScroll.getByRole("slider", { name: "Pages a minute" }),
    ).toBeVisible();
    await autoScroll
      .getByRole("switch", { name: "Pause auto scroll at the end of a book" })
      .click();

    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      LOOK_KEY,
    );
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ pausesAtEnd: false });
  });
});
