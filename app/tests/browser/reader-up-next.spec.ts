import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  LARGEST_TEXT_SCALE,
  onPlatform,
  setTextScale,
  sidewaysOverflow,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
  NEXT_BOOK,
  NOT_STARTED,
  PAGE_COUNT,
  readerBook,
  servePages,
} from "./reader-book.ts";

const READ_SECONDS = 72 * 60;
const SECONDS_A_PAGE = 23;
const SUMMARY = {
  readSeconds: READ_SECONDS,
  pageCount: PAGE_COUNT,
  secondsPerPage: SECONDS_A_PAGE,
};
const SWIPE_PX = 120;
const SERIES_PAGE = new RegExp(`/series/${BOOK_SERIES_ID}$`);
const NEXT_BOOK_PAGE = new RegExp(`/read/${NEXT_BOOK.id}$`);
const FINISHED = `${BOOK_TITLE} finished`;
const TABLET = { width: 820, height: 1180 };

type PhonePlatform = Extract<Platform, "ios" | "android">;

interface PhoneType {
  readonly size: string;
  readonly tracking: string;
  readonly weight: string;
}

const PHONE_TITLE_TYPE = {
  ios: { size: "22px", tracking: "-0.26px", weight: "700" },
  android: { size: "28px", tracking: "normal", weight: "400" },
} satisfies Record<PhonePlatform, PhoneType>;
const PHONE_FIGURE_TYPE = {
  ios: { size: "20px", tracking: "-0.45px", weight: "590" },
  android: { size: "24px", tracking: "normal", weight: "400" },
} satisfies Record<PhonePlatform, PhoneType>;
const PHONE_CARD_TITLE_TYPE = {
  ios: { size: "22px", tracking: "-0.26px", weight: "700" },
  android: { size: "22px", tracking: "normal", weight: "400" },
} satisfies Record<PhonePlatform, PhoneType>;
const PHONE_BUTTON_HEIGHT = { ios: 50, android: 40 } satisfies Record<
  PhonePlatform,
  number
>;
const SUBTITLE_WEIGHT = "400";
const NO_SPACES = "One_Piece_Vol_105_Digital_Colored_Edition";
const TABLET_TITLE_SIZE = "20px";
const TABLET_READ_LOOK = {
  ios: { height: 50, corner: "14px" },
  android: { height: 48, corner: "9999px" },
} satisfies Record<PhonePlatform, { height: number; corner: string }>;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
    readingSummary: () => SUMMARY,
  },
});

test.beforeEach(async ({ page }) => {
  await servePages(page);
});

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

async function openBook(page: Page): Promise<void> {
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function upNext(page: Page): Locator {
  return page.getByRole("heading", { level: 2, name: FINISHED });
}

async function turnPastTheEnd(page: Page): Promise<void> {
  await page.keyboard.press("End");
  await expect(
    page.getByRole("img", { name: `Page ${String(PAGE_COUNT)}`, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(upNext(page)).toBeVisible();
}

function stats(page: Page): Locator {
  return page.getByRole("group", { name: `Reading stats for ${BOOK_TITLE}` });
}

async function turnBookSummaryOff(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "omnileaf.smartFeatures",
      JSON.stringify({ showsBookSummary: false }),
    );
  });
}

function markedRead(page: Page): string {
  return isWide(page)
    ? "Marked as read"
    : `${BOOK_SERIES_TITLE} · marked as read`;
}

function skipSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: "Skip this screen" });
}

async function swipeAcross(page: Page, across: number): Promise<void> {
  const surface = page.getByRole("button", { name: "Next page" }).locator("..");
  const box = await boxOf(surface);
  const pointer = {
    pointerType: "touch",
    isPrimary: true,
    clientY: box.y + box.height / 2,
  };
  const x = box.x + box.width / 2;
  await surface.dispatchEvent("pointerdown", { ...pointer, clientX: x });
  await surface.dispatchEvent("pointerup", { ...pointer, clientX: x + across });
}

test("shows up next on turning past the last page, the book marked read with the time spent on it while Book summary is off", async ({
  page,
}) => {
  await turnBookSummaryOff(page);
  await openBook(page);

  await turnPastTheEnd(page);

  await expect(
    page.getByText(`${markedRead(page)} · 1 h 12 min`, { exact: true }),
  ).toBeVisible();
  await expect(stats(page)).toHaveCount(0);
  await expect(page.getByText(NEXT_BOOK.title, { exact: true })).toBeVisible();
  await expect(page.getByText("Unread", { exact: true })).toBeVisible();
  await expect(skipSwitch(page)).not.toBeChecked();
});

test("sums up the book just finished in its time, pages and time a page while Book summary is on", async ({
  page,
}) => {
  await openBook(page);

  await turnPastTheEnd(page);

  await expect(stats(page)).toHaveText(
    `1 h 12 min reading ${String(PAGE_COUNT)} pages ${String(SECONDS_A_PAGE)} s a page`,
    { useInnerText: true },
  );
  await expect(page.getByText(markedRead(page), { exact: true })).toBeVisible();
});

test("puts the stats between the title and the Up next card", async ({
  page,
}) => {
  await openBook(page);
  await turnPastTheEnd(page);

  const title = await boxOf(upNext(page));
  const row = await boxOf(stats(page));
  const card = await boxOf(page.getByText("Up next", { exact: true }));

  expect(row.y).toBeGreaterThan(title.y + title.height);
  expect(card.y).toBeGreaterThan(row.y + row.height);
});

test("keeps the stats in three columns at the largest text, wrapping inside them", async ({
  page,
}) => {
  await setTextScale(page, LARGEST_TEXT_SCALE);
  await openBook(page);
  await turnPastTheEnd(page);
  const row = await boxOf(stats(page));

  const labels = await Promise.all(
    ["reading", "pages", "a page"].map((label) =>
      boxOf(stats(page).getByText(label, { exact: true })),
    ),
  );

  const starts = labels.map(({ x }) => x);
  expect(starts).toEqual(starts.toSorted((one, other) => one - other));
  for (const label of labels) {
    expect(label.x + label.width).toBeLessThanOrEqual(row.x + row.width);
  }
  expect(
    await stats(page).evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
});

test("lets the title be scrolled to at the largest text", async ({ page }) => {
  await setTextScale(page, LARGEST_TEXT_SCALE);
  await openBook(page);
  await turnPastTheEnd(page);

  await upNext(page).scrollIntoViewIfNeeded();

  expect((await boxOf(upNext(page))).y).toBeGreaterThanOrEqual(0);
});

test.describe("a book whose reading isn't timed", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
      readingSummary: () => null,
    },
  });

  test("leaves the stats and the time out", async ({ page }) => {
    await openBook(page);

    await turnPastTheEnd(page);

    await expect(
      page.getByText(markedRead(page), { exact: true }),
    ).toBeVisible();
    await expect(stats(page)).toHaveCount(0);
  });
});

const TURNS_AGAIN = [
  {
    way: "a tap on the next page's side",
    turn: (page: Page) =>
      page
        .getByRole("button", { name: "Next page" })
        .click({ position: { x: 8, y: 8 } }),
  },
  {
    way: "a swipe",
    turn: (page: Page) => swipeAcross(page, -SWIPE_PX),
  },
  {
    way: "the right arrow",
    turn: (page: Page) => page.keyboard.press("ArrowRight"),
  },
  { way: "Space", turn: (page: Page) => page.keyboard.press("Space") },
  {
    way: "its Read button",
    turn: (page: Page) =>
      page.getByRole("link", { name: `Read ${NEXT_BOOK.title}` }).click(),
  },
];

for (const { way, turn } of TURNS_AGAIN) {
  test(`starts the next book from up next with ${way}`, async ({ page }) => {
    await openBook(page);
    await turnPastTheEnd(page);

    await turn(page);

    await expect(page).toHaveURL(NEXT_BOOK_PAGE);
  });
}

test("names the series and the book finished in a breadcrumb on desktops", async ({
  page,
}) => {
  test.skip(!isWide(page), "phones show only the way back");
  await openBook(page);

  await turnPastTheEnd(page);

  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(
    new RegExp(`${BOOK_SERIES_TITLE}.*${BOOK_TITLE}`),
  );
});

test("hints Esc on its Back to the series button on a desktop", async ({
  page,
}) => {
  await openBook(page);
  await turnPastTheEnd(page);

  const back = page.getByRole("link", { name: "Back to the series" });

  await expect(back.locator("kbd")).toHaveText("Esc");
  await expect(back.locator("kbd")).toBeVisible();
});

test("hints the → key on its Read button on a desktop", async ({ page }) => {
  await openBook(page);
  await turnPastTheEnd(page);

  const read = page.getByRole("link", { name: `Read ${NEXT_BOOK.title}` });

  await expect(read.locator("kbd")).toHaveText("→");
  await expect(read.locator("kbd")).toBeVisible();
  await expect(read).toHaveAccessibleName(`Read ${NEXT_BOOK.title}`);
});

test.describe("on a phone", () => {
  test.use({
    backend: {
      ...onPlatform("ios").backend,
      openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
      readingSummary: () => SUMMARY,
    },
  });

  test("leaves the → key off its Read button", async ({ page }) => {
    await openBook(page);
    await turnPastTheEnd(page);

    const read = page.getByRole("link", { name: `Read ${NEXT_BOOK.title}` });

    await expect(read).toBeVisible();
    await expect(read.locator("kbd")).toBeHidden();
  });
});

test.describe("up next as the phone draws it", { tag: "@native" }, () => {
  function check(page: Page): Locator {
    return page.getByRole("main").locator("[data-icon=circle-check]");
  }

  function figure(page: Page): Locator {
    return stats(page).getByText(String(PAGE_COUNT), { exact: true });
  }

  async function expectType(text: Locator, type: PhoneType): Promise<void> {
    await expect(text).toHaveCSS("font-size", type.size);
    await expect(text).toHaveCSS("letter-spacing", type.tracking);
    await expect(text).toHaveCSS("font-weight", type.weight);
  }

  function upNextCard(page: Page): Locator {
    return page.locator("[data-slot=card]").filter({
      has: page.getByRole("heading", { level: 2, name: "Up next" }),
    });
  }

  test("centres the check above the title on an iPhone", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "iPhones only");
    await openBook(page);

    await turnPastTheEnd(page);
    const mark = await boxOf(check(page));
    const title = await boxOf(upNext(page));

    expect(mark.x + mark.width / 2).toBeCloseTo(viewportOf(page).width / 2, 0);
    expect(mark.y + mark.height).toBeLessThanOrEqual(title.y);
    await expect(upNext(page)).toHaveCSS("text-align", "center");
  });

  test("starts the title at the edge with no check on an Android phone", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "android", "Android phones only");
    await openBook(page);

    await turnPastTheEnd(page);

    await expect(check(page)).toHaveCount(0);
    await expect(upNext(page)).toHaveCSS("text-align", "start");
  });

  test("sets the title and the stats in the phone's own type", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);

    await turnPastTheEnd(page);

    await expectType(upNext(page), PHONE_TITLE_TYPE[platform]);
    await expectType(figure(page), PHONE_FIGURE_TYPE[platform]);
    await expect(
      page.getByRole("heading", { level: 2, name: "Up next" }),
    ).toHaveCSS("font-weight", SUBTITLE_WEIGHT);
  });

  test("centres itself in the space under the way back when it fits", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);

    await turnPastTheEnd(page);
    const section = page.getByRole("region", { name: FINISHED });
    const content = await boxOf(section);
    const room = await boxOf(section.locator(".."));

    expect(content.y - room.y).toBeCloseTo(
      room.y + room.height - (content.y + content.height),
      0,
    );
  });

  test.describe("with titles that have no spaces", () => {
    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        openBook: (id) => ({
          ...readerBook(NOT_STARTED),
          id,
          title: NO_SPACES,
          seriesTitle: NO_SPACES,
          next: { ...NEXT_BOOK, title: NO_SPACES },
        }),
        readingSummary: () => SUMMARY,
      },
    });

    test("keeps them inside the window, with the buttons' words centred", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }
      await page.goto(`/read/${BOOK_ID}`);
      await expect(
        page.getByRole("heading", { level: 1, name: NO_SPACES }),
      ).toBeAttached();

      await page.keyboard.press("End");
      await page.keyboard.press("ArrowRight");
      const read = page.getByRole("link", { name: `Read ${NO_SPACES}` });

      await expect(read).toBeVisible();
      await expect(read).toHaveCSS("text-align", "center");
      expect(await sidewaysOverflow(page)).toEqual([]);
    });
  });

  test("keeps today's title on a tablet", async ({ page, platform }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await page.setViewportSize(TABLET);
    await openBook(page);

    await turnPastTheEnd(page);

    await expect(upNext(page)).toHaveCSS("text-align", "start");
    await expect(upNext(page)).toHaveCSS("font-size", TABLET_TITLE_SIZE);
  });

  test("sets Skip this screen in a grouped row, on the cards' plate and toggled from its switch alone on an iPhone", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);
    await turnPastTheEnd(page);

    await page
      .getByRole("main")
      .getByText("Skip this screen", { exact: true })
      .click();

    await expect(skipSwitch(page)).toBeChecked({
      checked: platform === "android",
    });
    if (platform === "ios") {
      await expect(skipSwitch(page).locator("../..")).toHaveCSS(
        "background-color",
        await upNextCard(page).evaluate(
          (card) => getComputedStyle(card).backgroundColor,
        ),
      );
    }
  });

  test("rings the Skip this screen switch inside its plate when focused from the keyboard", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);
    await turnPastTheEnd(page);

    await skipSwitch(page).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");

    await expect(skipSwitch(page)).toBeFocused();
    await expect(skipSwitch(page)).toHaveCSS("outline-style", "solid");
    expect(
      parseFloat(
        await skipSwitch(page).evaluate(
          (control) => getComputedStyle(control).outlineOffset,
        ),
      ),
    ).toBeLessThan(0);
  });

  test("keeps today's Read button and Skip this screen row on a tablet", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await page.setViewportSize(TABLET);
    await openBook(page);
    await turnPastTheEnd(page);
    const read = page.getByRole("link", { name: `Read ${NEXT_BOOK.title}` });

    await page
      .getByRole("main")
      .getByText("Skip this screen", { exact: true })
      .click();

    expect((await boxOf(read)).height).toBe(TABLET_READ_LOOK[platform].height);
    await expect(read).toHaveCSS(
      "border-start-start-radius",
      TABLET_READ_LOOK[platform].corner,
    );
    await expect(skipSwitch(page)).toBeChecked();
  });

  test("draws a book in the cover's place when the next book has no cover", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);

    await turnPastTheEnd(page);

    await expect(
      upNextCard(page).locator("[data-up-next-cover] svg"),
    ).toBeVisible();
  });

  test("keeps the buttons as wide as each other and everything inside the window at the largest text in a long language", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await openBook(page);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    const main = page.getByRole("main");

    const read = await boxOf(main.getByRole("link", { name: /^⟦Ŕéáð / }));
    const back = await boxOf(
      main.getByRole("link", { name: /^⟦Ɓáçķ ţö ţĥé šéŕíéš/ }),
    );

    expect(back.width).toBeCloseTo(read.width, 0);
    expect(back.y).toBeGreaterThan(read.y + read.height);
    expect(await sidewaysOverflow(page)).toEqual([]);
  });

  test("wraps the stats between words at the largest text", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await openBook(page);
    await turnPastTheEnd(page);
    const label = stats(page).getByText("pages", { exact: true });

    const { height } = await boxOf(label);
    const lineHeight = await label.evaluate((element) =>
      parseFloat(getComputedStyle(element).lineHeight),
    );

    expect(height).toBeCloseTo(lineHeight, 0);
  });

  test("has no accessibility violations", async ({ page, platform }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);
    await turnPastTheEnd(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });

  test.describe("at the end of a series", () => {
    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        openBook: () => ({ ...readerBook(NOT_STARTED), next: null }),
        readingSummary: () => SUMMARY,
      },
    });

    function seriesFinished(page: Page): Locator {
      return page.getByRole("heading", {
        level: 2,
        name: "You've read every book in this series",
      });
    }

    test("leads back to the series and then the library on the phone's own buttons", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }
      await openBook(page);
      await turnPastTheEnd(page);
      const main = page.getByRole("main");

      const series = await boxOf(
        main.getByRole("link", { name: "Back to the series" }),
      );
      const library = await boxOf(
        main.getByRole("link", { name: "Back to the library" }),
      );

      expect(series.height).toBe(PHONE_BUTTON_HEIGHT[platform]);
      expect(library.height).toBe(PHONE_BUTTON_HEIGHT[platform]);
      expect(library.width).toBeCloseTo(series.width, 0);
      expect(library.y).toBeGreaterThan(series.y + series.height);
    });

    test("sets the card's title in the phone's own type", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }
      await openBook(page);

      await turnPastTheEnd(page);

      await expectType(seriesFinished(page), PHONE_CARD_TITLE_TYPE[platform]);
    });

    test("keeps everything inside the window at the largest text in a long language", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios" && platform !== "android") {
        test.skip();
        return;
      }
      await page.addInitScript(() => {
        window.localStorage.setItem("omnileaf.language", "en-XA");
      });
      await setTextScale(page, LARGEST_TEXT_SCALE);
      await openBook(page);

      await page.keyboard.press("End");
      await page.keyboard.press("ArrowRight");

      await expect(
        page
          .getByRole("main")
          .getByRole("link", { name: /^⟦Ɓáçķ ţö ţĥé ļíƀŕáŕý/ }),
      ).toBeVisible();
      expect(await sidewaysOverflow(page)).toEqual([]);
    });
  });
});

test.describe("a next book whose pages are counted", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({
        ...readerBook(NOT_STARTED),
        id,
        next: { ...NEXT_BOOK, pageCount: 184 },
      }),
      readingSummary: () => SUMMARY,
    },
  });

  test("names how many pages it has and how far it was read", async ({
    page,
  }) => {
    await openBook(page);

    await turnPastTheEnd(page);

    await expect(page.getByText("184 pages · unread")).toBeVisible();
  });
});

test.describe("a book read right to left", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({
        ...readerBook(NOT_STARTED),
        id,
        readingDirection: "rightToLeft",
      }),
      readingSummary: () => SUMMARY,
    },
  });

  test("hints the ← key on its Read button", async ({ page }) => {
    await openBook(page);
    await page.keyboard.press("End");
    await expect(
      page.getByRole("img", {
        name: `Page ${String(PAGE_COUNT)}`,
        exact: true,
      }),
    ).toBeVisible();

    await page.keyboard.press("ArrowLeft");

    await expect(
      page
        .getByRole("link", { name: `Read ${NEXT_BOOK.title}` })
        .locator("kbd"),
    ).toHaveText("←");
  });
});

test("goes back to the last page on turning back from up next", async ({
  page,
}) => {
  await openBook(page);
  await turnPastTheEnd(page);

  await page.keyboard.press("ArrowLeft");

  await expect(upNext(page)).toBeHidden();
  await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
    "aria-valuetext",
    `Page ${String(PAGE_COUNT)} of ${String(PAGE_COUNT)}`,
  );
});

test("goes back to the series from up next with Escape", async ({ page }) => {
  await openBook(page);
  await turnPastTheEnd(page);

  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(SERIES_PAGE);
});

for (const name of [`Back to ${BOOK_SERIES_TITLE}`, "Back to the series"]) {
  test(`goes back to the series from up next's ${name} link`, async ({
    page,
  }) => {
    await openBook(page);
    await turnPastTheEnd(page);

    await page.getByRole("main").getByRole("link", { name }).click();

    await expect(page).toHaveURL(SERIES_PAGE);
  });
}

test("turns Skip Up next on in Settings › Reader from up next's switch", async ({
  page,
}) => {
  await openBook(page);
  await turnPastTheEnd(page);

  await expect(skipSwitch(page)).toHaveAccessibleDescription(
    "Go straight on next time. Also in Settings › Reader.",
  );
  await skipSwitch(page).click();
  await expect(skipSwitch(page)).toBeChecked();
  await page.goto("/settings/reading");

  await expect(
    page.getByRole("heading", { level: 1, name: "Reader" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Skip Up next" }),
  ).toBeChecked();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`up next has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openBook(page);
    await turnPastTheEnd(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test.describe("with Skip Up next on", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("omnileaf.skipUpNext", "on");
    });
  });

  test("goes straight on to the next book, naming it in a toast", async ({
    page,
  }) => {
    await openBook(page);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");

    await expect(page).toHaveURL(NEXT_BOOK_PAGE);
    await expect(
      page.getByText(`Now reading ${NEXT_BOOK.title}`),
    ).toBeVisible();
  });

  test("goes back to the last page of the book finished with the toast's Undo", async ({
    page,
  }) => {
    await openBook(page);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(NEXT_BOOK_PAGE);

    await page.getByRole("button", { name: "Undo" }).click();

    await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
    await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
      "aria-valuetext",
      `Page ${String(PAGE_COUNT)} of ${String(PAGE_COUNT)}`,
    );
  });
});

test.describe("the last book of a series", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: () => ({ ...readerBook(NOT_STARTED), next: null }),
      readingSummary: () => SUMMARY,
    },
  });

  test("says every book is read and leads back to the series or the library", async ({
    page,
  }) => {
    await openBook(page);
    await turnPastTheEnd(page);
    await expect(page.getByText("Up next")).toBeHidden();
    await expect(
      page.getByText("You've read every book in this series"),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Back to the library" }),
    ).toHaveAttribute("href", "/");

    await page
      .getByRole("main")
      .getByRole("link", { name: "Back to the series" })
      .click();

    await expect(page).toHaveURL(SERIES_PAGE);
  });

  test("puts the stats above the card saying every book is read", async ({
    page,
  }) => {
    await openBook(page);
    await turnPastTheEnd(page);

    const row = await boxOf(stats(page));
    const card = await boxOf(
      page.getByText("You've read every book in this series"),
    );

    expect(card.y).toBeGreaterThan(row.y + row.height);
  });

  test("goes back to the series on turning the page again", async ({
    page,
  }) => {
    await openBook(page);
    await turnPastTheEnd(page);

    await page.keyboard.press("ArrowRight");

    await expect(page).toHaveURL(SERIES_PAGE);
  });

  test("shows up next even with Skip Up next on, as there's no book to go on to", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("omnileaf.skipUpNext", "on");
    });
    await openBook(page);

    await turnPastTheEnd(page);

    await expect(upNext(page)).toBeVisible();
  });
});
