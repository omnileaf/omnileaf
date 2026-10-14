import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import {
  CommandFailure,
  emitFakeEvent,
  type FakeBackend,
  fakeProtocolRoute,
} from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  LARGE_MIN_WIDTH,
  NOTHING_READ_THIS_WEEK,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";

type WireEntry = Awaited<
  ReturnType<FakeBackend["readingHistory"]>
>["entries"][number];

const MONDAY_EVENING = new Date("2026-10-05T22:30:00Z");
const TUESDAY_SMALL_HOURS = new Date("2026-10-06T01:00:00Z");
const LIBRARY_CHANGED = "library-changed";
const MINUTE = 60;
const READ_THIS_WEEK = 3 * 60 * MINUTE + 12 * MINUTE;
const READ_LAST_WEEK = 70 * MINUTE;
const ENTRIES_PER_PAGE = 50;
const DAY_MS = 86_400_000;
const MONDAY = Date.UTC(2026, 9, 5) / DAY_MS;
const LAST_WEEK_FIRST = MONDAY - 8;
const LAST_WEEK_LAST = MONDAY - 2;
const DESKTOP_SECTION_GAP = 18;
const DESKTOP_ACTION_RADIUS = "8px";
const PHONE_LIST_INSET = 20;
const LANGUAGES = { en: english, "en-XA": pseudo } as const;

interface Session {
  readonly number: number;
  readonly startedAt: string;
  readonly minutes: number;
  readonly readTo: WireEntry["readTo"];
  readonly dayMinutes: number;
}

function bookId(number: number): string {
  return `0190a3e4-0000-8000-8000-${String(number).padStart(12, "0")}`;
}

function seriesId(number: number): string {
  return `0190a3e4-0000-8000-8001-${String(number).padStart(12, "0")}`;
}

function seriesTitle(number: number): string {
  return `Sample Series ${String(number).padStart(2, "0")}`;
}

function bookTitle(number: number): string {
  return `${seriesTitle(number)} v${String(number).padStart(2, "0")}`;
}

function entry({
  number,
  startedAt,
  minutes,
  readTo,
  dayMinutes,
}: Session): WireEntry {
  return {
    book: bookId(number),
    bookTitle: bookTitle(number),
    series: seriesId(number),
    seriesTitle: seriesTitle(number),
    position: number,
    cover: null,
    startedAtMs: Date.parse(startedAt),
    utcOffsetMinutes: 0,
    readSeconds: minutes * MINUTE,
    readTo,
    reading:
      readTo.state === "end"
        ? { state: "read" }
        : { state: "started", page: readTo.page },
    day: {
      day: Math.floor(Date.parse(startedAt) / DAY_MS),
      readSeconds: dayMinutes * MINUTE,
    },
  };
}

const ON_PAGE_14 = { state: "page", page: 14, pageCount: 30 } as const;

const SESSIONS: readonly WireEntry[] = [
  entry({
    number: 4,
    startedAt: "2026-10-05T21:40:00.000Z",
    minutes: 24,
    readTo: ON_PAGE_14,
    dayMinutes: 52,
  }),
  entry({
    number: 7,
    startedAt: "2026-10-05T19:05:00.000Z",
    minutes: 28,
    readTo: { state: "end" },
    dayMinutes: 52,
  }),
  entry({
    number: 1,
    startedAt: "2026-10-04T22:15:00.000Z",
    minutes: 46,
    readTo: { state: "page", page: 88, pageCount: 192 },
    dayMinutes: 70,
  }),
  entry({
    number: 9,
    startedAt: "2026-10-04T08:30:00.000Z",
    minutes: 24,
    readTo: { state: "page", page: 3, pageCount: 24 },
    dayMinutes: 70,
  }),
  entry({
    number: 6,
    startedAt: "2026-09-29T20:10:00.000Z",
    minutes: 70,
    readTo: { state: "page", page: 40, pageCount: 180 },
    dayMinutes: 70,
  }),
];

function pagedSessions(
  sessions: readonly WireEntry[],
): FakeBackend["readingHistory"] {
  return (after) => {
    const start = after === null ? 0 : Number(after);
    const end = start + ENTRIES_PER_PAGE;
    return {
      entries: sessions.slice(start, end),
      next: end < sessions.length ? String(end) : null,
    };
  };
}

const READ_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  readingHistory: pagedSessions(SESSIONS),
  readingWeek: () => ({
    readSeconds: READ_THIS_WEEK,
    booksOpened: 6,
    booksFinished: 2,
    daysInARow: 4,
  }),
  readingTimeBetween: (firstDay, lastDay) =>
    firstDay === LAST_WEEK_FIRST && lastDay === LAST_WEEK_LAST
      ? READ_LAST_WEEK
      : 0,
};

function isDesktop(page: Page): boolean {
  return viewportOf(page).width >= LARGE_MIN_WIDTH;
}

function days(page: Page): Locator {
  return page
    .getByRole("main")
    .getByRole("region")
    .filter({ has: page.getByRole("heading", { level: 2 }) });
}

function week(page: Page): Locator {
  return page.getByRole("region", { name: "This week" });
}

function rows(page: Page): Locator {
  return days(page).getByRole("listitem");
}

async function openHistory(page: Page, title = "History"): Promise<void> {
  await page.clock.setFixedTime(MONDAY_EVENING);
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
}

function startOf(message: string): RegExp {
  const start = message.slice(0, message.indexOf("{"));
  return new RegExp(
    `^${start.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}`,
  );
}

async function linesOf(
  cells: Locator,
): Promise<{ lines: number; fits: boolean }[]> {
  return cells.evaluateAll((elements) =>
    elements.map((element) => ({
      lines: Math.round(
        element.getBoundingClientRect().height /
          Number.parseFloat(getComputedStyle(element).lineHeight),
      ),
      fits: element.scrollWidth <= element.clientWidth,
    })),
  );
}

test.describe("before anything is read", () => {
  test("shows the title and that nothing is read yet, and nothing to switch, search or clear", async ({
    page,
  }) => {
    await openHistory(page);

    await expect(
      page.getByRole("heading", { level: 2, name: "Nothing read yet" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Books you open show up here, newest first, so you can pick up where you left off.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Clear history" }),
    ).toHaveCount(0);
    await expect(page.getByText("Read this week")).toHaveCount(0);
  });
});

test.describe("with books read", () => {
  test.use({ backend: READ_BACKEND });

  test("lists what was read newest first, a day at a time, with the time read each day", async ({
    page,
  }) => {
    await openHistory(page);

    await expect(days(page)).toHaveCount(3);
    await expect(
      page.getByRole("region", { name: "Today 52 min" }).getByRole("listitem"),
    ).toHaveCount(2);
    await expect(
      page
        .getByRole("region", { name: "Yesterday 1 h 10 min" })
        .getByRole("listitem"),
    ).toHaveCount(2);
    await expect(
      page
        .getByRole("region", { name: "Last week 1 h 10 min" })
        .getByRole("listitem"),
    ).toHaveCount(1);
    await expect(rows(page).first()).toContainText(seriesTitle(4));
    await expect(rows(page).last()).toContainText(seriesTitle(6));
  });

  test("gives the weekday with the time of a session read last week", async ({
    page,
  }) => {
    await openHistory(page);

    await expect(
      page.getByRole("region", { name: /^Last week/ }).getByRole("listitem"),
    ).toContainText(/Tue 8:10\sPM/);
  });

  test("sums up the week, with the books opened and finished from a tablet up", async ({
    page,
  }) => {
    await openHistory(page);
    const isPhone = viewportOf(page).width < MEDIUM_MIN_WIDTH;

    const cards = week(page).getByRole("listitem");

    await expect(cards).toHaveText(
      isPhone
        ? [/Read this week\s*3 h 12 min$/, /Days in a row\s*4$/]
        : [
            /Read this week\s*3 h 12 min$/,
            /Books opened\s*6$/,
            /Finished\s*2$/,
            /Days in a row\s*4$/,
          ],
    );
  });

  test("says where each session left its book, when it began and how long it went on", async ({
    page,
  }) => {
    await openHistory(page);

    const first = rows(page).first();
    await expect(first).toContainText(bookTitle(4));
    await expect(
      first.getByRole("progressbar", { name: "Page 14 of 30" }),
    ).toBeVisible();
    await expect(first).toContainText("14 / 30");
    await expect(rows(page).nth(1)).toContainText(bookTitle(7));
    await expect(
      rows(page).nth(1).getByText("Finished").filter({ visible: true }),
    ).toBeVisible();
    await expect(rows(page).nth(1).getByRole("progressbar")).toHaveCount(0);
    if (isDesktop(page)) {
      await expect(first).toContainText(/Started at 9:40\sPM/);
      await expect(first).toContainText("Read for 24 min");
    } else {
      await expect(first).toContainText(/9:40\sPM · 24 min/);
    }
  });

  test("continues a book in the reader from its session", async ({ page }) => {
    await openHistory(page);

    const continuing = isDesktop(page)
      ? page.getByRole("link", {
          name: `Continue ${seriesTitle(4)}, ${bookTitle(4)}`,
        })
      : rows(page).first().getByRole("link");
    await continuing.click();

    await expect(page).toHaveURL(new RegExp(`/read/${bookId(4)}$`));
  });

  test("offers to read a finished book again", async ({ page }) => {
    await openHistory(page);

    const again = isDesktop(page)
      ? page.getByRole("link", {
          name: `Read again ${seriesTitle(7)}, ${bookTitle(7)}`,
        })
      : rows(page).nth(1).getByRole("link");
    await again.click();

    await expect(page).toHaveURL(new RegExp(`/read/${bookId(7)}$`));
  });

  test("draws a session as one link on a phone or tablet and as a row with its own button on a desktop", async ({
    page,
  }) => {
    await openHistory(page);

    const links = rows(page).first().getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAccessibleName(
      isDesktop(page)
        ? `Continue ${seriesTitle(4)}, ${bookTitle(4)}`
        : new RegExp(`^${seriesTitle(4)}`),
    );
  });

  test("sets the week between the header and the days the way the desktop board does", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktops only");
    await openHistory(page);
    const header = await boxOf(
      page.getByRole("main").locator("[data-page-toolbar]"),
    );

    const summed = await boxOf(week(page));
    const columns = await boxOf(
      page.getByRole("main").getByText("Book", { exact: true }).locator(".."),
    );

    expect(summed.y - (header.y + header.height)).toBeCloseTo(
      DESKTOP_SECTION_GAP,
      0,
    );
    expect(columns.y - (summed.y + summed.height)).toBeCloseTo(
      DESKTOP_SECTION_GAP,
      0,
    );
  });

  test("heads the columns of every day once on a desktop", async ({ page }) => {
    test.skip(!isDesktop(page), "desktops only");
    await openHistory(page);

    const headings = ["Book", "Started", "Read for", "Progress"].map((name) =>
      page.getByRole("main").getByText(name, { exact: true }),
    );

    for (const heading of headings) {
      await expect(heading).toHaveCount(1);
      await expect(heading).toBeVisible();
    }
  });

  test("rounds each row's button the way the desktop board does", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktops only");
    await openHistory(page);

    const action = page.getByRole("link", {
      name: `Continue ${seriesTitle(4)}, ${bookTitle(4)}`,
    });

    await expect(action).toHaveCSS("border-radius", DESKTOP_ACTION_RADIUS);
  });

  test("names the days again from the date the list is read again on", async ({
    page,
  }) => {
    await openHistory(page);
    await expect(
      page.getByRole("region", { name: "Today 52 min" }),
    ).toBeVisible();

    await page.clock.setFixedTime(TUESDAY_SMALL_HOURS);
    await emitFakeEvent(page, LIBRARY_CHANGED);

    await expect(
      page.getByRole("region", { name: "Yesterday 52 min" }),
    ).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openHistory(page);
      await expect(rows(page)).toHaveCount(SESSIONS.length);

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

for (const platform of ["ios", "android"] as const) {
  test.describe(`on an ${platform} phone`, () => {
    test.use({
      backend: { ...READ_BACKEND, appInfo: () => fakeAppInfo(platform) },
    });

    test("sets the days and their sessions in from both sides of a phone as the board does", async ({
      page,
    }) => {
      test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
      await openHistory(page);

      const firstDay = await boxOf(days(page).first());
      const firstCard = await boxOf(days(page).first().getByRole("list"));

      for (const box of [firstDay, firstCard]) {
        expect(box.x).toBeCloseTo(PHONE_LIST_INSET, 0);
        expect(viewportOf(page).width - (box.x + box.width)).toBeCloseTo(
          PHONE_LIST_INSET,
          0,
        );
      }
    });
  });
}

test.describe("with a day last week read only in a book no longer in the library", () => {
  test.use({
    backend: {
      ...READ_BACKEND,
      readingTimeBetween: () => READ_LAST_WEEK + 55 * MINUTE,
    },
  });

  test("counts that day's time in last week's total, as the week's total counts it", async ({
    page,
  }) => {
    await openHistory(page);

    await expect(
      page.getByRole("region", { name: "Last week 2 h 5 min" }),
    ).toBeVisible();
  });
});

test.describe("on a device whose region starts its weeks on Monday", () => {
  test.use({
    locale: "en-GB",
    backend: {
      ...READ_BACKEND,
      readingWeek: (weekStart) => ({
        ...NOTHING_READ_THIS_WEEK,
        readSeconds: weekStart === MONDAY ? READ_THIS_WEEK : 0,
      }),
    },
  });

  test("counts the time read this week from Monday", async ({ page }) => {
    await openHistory(page);

    await expect(week(page).getByRole("listitem").first()).toHaveText(
      /3 h 12 min$/,
    );
  });
});

test.describe("with Screenshot mode on", () => {
  let coverRequests = 0;

  test.use({
    backend: {
      ...READ_BACKEND,
      readingHistory: pagedSessions(
        SESSIONS.map((session) => ({
          ...session,
          cover: `thumb/v1/${session.book}/1/1`,
        })),
      ),
    },
  });

  test.beforeEach(async ({ page }) => {
    coverRequests = 0;
    await page.route(fakeProtocolRoute("omni"), (route) => {
      coverRequests += 1;
      return route.abort();
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({ activity: { kind: "on" } }),
      );
    });
  });

  test("shows stand-ins for every series and book, asks for no cover and keeps the times real", async ({
    page,
  }) => {
    await openHistory(page);
    await expect(rows(page)).toHaveCount(SESSIONS.length);

    const first = rows(page).first();
    await expect(first).toContainText(/Series \d{2,3}.*Book 4\s*14 \/ 30/);
    await expect(first).toContainText(/9:40\sPM/);
    for (const link of await rows(page).getByRole("link").all()) {
      await expect(link).not.toHaveAccessibleName(/Sample Series/);
    }
    expect(await page.content()).not.toContain("Sample Series");
    await expect(rows(page).getByRole("presentation")).toHaveCount(0);
    expect(coverRequests).toBe(0);
  });
});

test.describe("with sessions at the widest times and lengths", () => {
  const widest = [
    entry({
      number: 3,
      startedAt: "2026-10-05T12:58:00.000Z",
      minutes: 8 * 60 + 58,
      readTo: ON_PAGE_14,
      dayMinutes: 8 * 60 + 58,
    }),
    entry({
      number: 5,
      startedAt: "2026-09-30T12:58:00.000Z",
      minutes: 118,
      readTo: ON_PAGE_14,
      dayMinutes: 118,
    }),
    entry({
      number: 8,
      startedAt: "2026-09-15T12:58:00.000Z",
      minutes: 58,
      readTo: ON_PAGE_14,
      dayMinutes: 58,
    }),
  ];

  test.use({
    backend: { ...READ_BACKEND, readingHistory: pagedSessions(widest) },
  });

  test("names a day before last week by its full date", async ({ page }) => {
    await openHistory(page);

    await expect(
      page.getByRole("region", { name: "Tuesday, September 15 58 min" }),
    ).toBeVisible();
  });

  test("lines each session's time and length up in columns on a desktop", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktops only");
    await openHistory(page);
    await page.evaluate(() => document.fonts.ready);
    const widthsOf = (cells: Locator): Promise<number[]> =>
      cells.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().width),
      );

    const columns = [
      await widthsOf(
        rows(page)
          .getByText(/^Started at /)
          .locator("xpath=.."),
      ),
      await widthsOf(
        rows(page)
          .getByText(/^Read for /)
          .locator("xpath=.."),
      ),
    ];

    expect(columns.map((widths) => new Set(widths).size)).toEqual([1, 1]);
  });

  for (const [language, messages] of Object.entries(LANGUAGES)) {
    test(`keeps each session's time and length on one line on a desktop in ${language}`, async ({
      page,
    }) => {
      test.skip(!isDesktop(page), "desktops only");
      await page.addInitScript((chosen) => {
        window.localStorage.setItem("omnileaf.language", chosen);
      }, language);
      await openHistory(page, messages.history_title);
      const times = rows(page)
        .getByText(startOf(messages.history_started_at))
        .locator("xpath=..");
      const lengths = rows(page)
        .getByText(startOf(messages.history_read_for))
        .locator("xpath=..");
      await expect(times).toHaveCount(widest.length);
      await expect(lengths).toHaveCount(widest.length);
      await page.evaluate(() => document.fonts.ready);

      const cells = [...(await linesOf(times)), ...(await linesOf(lengths))];

      expect(cells).toEqual(
        Array.from({ length: 2 * widest.length }, () => ({
          lines: 1,
          fits: true,
        })),
      );
    });
  }
});

test.describe("with a series and book named past the width of a row", () => {
  const LONG_NAME =
    "Attack on Titan v01-v30 (Digital) (LostNerevarine+Hexer+danke-Empire) ".repeat(
      3,
    );

  test.use({
    backend: {
      ...READ_BACKEND,
      readingHistory: pagedSessions(
        SESSIONS.map((session) => ({
          ...session,
          seriesTitle: LONG_NAME,
          bookTitle: LONG_NAME,
        })),
      ),
    },
  });

  test("keeps each row's button whole inside the list on a desktop", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktops only");
    await openHistory(page);
    const list = days(page).first().getByRole("list");
    const buttons = rows(page).getByRole("link").filter({ visible: true });
    await expect(buttons).toHaveCount(SESSIONS.length);

    const listEnd = (await boxOf(list)).x + (await boxOf(list)).width;
    const buttonEnds = await buttons.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().right),
    );

    expect(buttonEnds.every((end) => end <= listEnd + 0.5)).toBe(true);
    expect(
      new Set(
        await buttons.evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().width),
        ),
      ).size,
    ).toBe(1);
  });

  test("keeps a long series and book name to one line each", async ({
    page,
  }) => {
    await openHistory(page);

    const names = rows(page)
      .first()
      .getByText(LONG_NAME.trim())
      .filter({ visible: true });

    await expect(names).toHaveCount(2);
    expect((await linesOf(names)).map(({ lines }) => lines)).toEqual([1, 1]);
  });
});

test.describe("on an iPad as wide as a desktop", () => {
  test.use({
    backend: { ...READ_BACKEND, appInfo: () => fakeAppInfo("ios") },
    viewport: { width: 1376, height: 1032 },
  });

  test("draws a session as one link, as on a phone, rather than a row with a button sized for a pointer", async ({
    page,
  }) => {
    await openHistory(page);

    const links = rows(page).first().getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAccessibleName(new RegExp(`^${seriesTitle(4)}`));
  });
});

test.describe("with a long history", () => {
  const many = Array.from({ length: 2 * ENTRIES_PER_PAGE + 10 }, (_, index) =>
    entry({
      number: index + 1,
      startedAt: new Date(
        MONDAY_EVENING.getTime() - (index + 1) * 60 * MINUTE * 1000,
      ).toISOString(),
      minutes: 30,
      readTo: ON_PAGE_14,
      dayMinutes: 300,
    }),
  );

  test.use({
    backend: { ...READ_BACKEND, readingHistory: pagedSessions(many) },
  });

  test("reads older sessions as the list scrolls to its end", async ({
    page,
  }) => {
    await openHistory(page);
    await expect(rows(page)).toHaveCount(ENTRIES_PER_PAGE);

    for (const shown of [2 * ENTRIES_PER_PAGE, many.length]) {
      await rows(page).last().scrollIntoViewIfNeeded();
      await expect(rows(page)).toHaveCount(shown);
    }
    await expect(rows(page).last()).toContainText(seriesTitle(many.length));
  });
});

test.describe("when history can't be read", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      readingHistory: () => {
        throw new CommandFailure({
          code: "internal",
          message: "the library database is unreadable",
        });
      },
    },
  });

  test("says history couldn't be loaded", async ({ page }) => {
    await openHistory(page);

    await expect(
      page.getByText("Couldn't load your history. Try again later."),
    ).toBeVisible();
  });
});

test.describe("a book's reading sessions", () => {
  const BOOK = 4;
  const ofTheBook = [
    SESSIONS[0],
    entry({
      number: BOOK,
      startedAt: "2026-10-04T20:00:00.000Z",
      minutes: 50,
      readTo: { state: "page", page: 9, pageCount: 30 },
      dayMinutes: 70,
    }),
    entry({
      number: BOOK,
      startedAt: "2026-10-02T18:30:00.000Z",
      minutes: 38,
      readTo: { state: "page", page: 4, pageCount: 30 },
      dayMinutes: 38,
    }),
  ].flatMap((session) => (session === undefined ? [] : [session]));

  test.use({
    backend: {
      ...READ_BACKEND,
      readingHistory: (after, of) =>
        pagedSessions(of.kind === "book" ? ofTheBook : SESSIONS)(after, of),
      bookSessions: () => ({
        sessions: 3,
        readSeconds: 112 * MINUTE,
        firstDay: MONDAY - 3,
        lastDay: MONDAY,
      }),
    },
  });

  async function expectSessionsIn(shown: Locator): Promise<void> {
    await expect(shown).toContainText(seriesTitle(BOOK));
    await expect(shown.getByRole("term")).toHaveText([
      "Time read",
      "Sessions",
      "First opened",
      "Last read",
    ]);
    await expect(shown.getByRole("definition")).toHaveText([
      "1 h 52 min",
      "3",
      "Friday, October 2",
      "Today",
    ]);
    const sessions = shown.getByRole("listitem");
    await expect(sessions).toHaveCount(3);
    await expect(sessions.first()).toContainText(
      /Today.*9:40\sPM · 24 min.*to page 14/,
    );
    await expect(sessions.last()).toContainText("to page 4");
    await expect(
      shown.getByRole("link", { name: "Open series" }),
    ).toHaveAttribute("href", `/series/${seriesId(BOOK)}`);
    await expect(shown.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      `/read/${bookId(BOOK)}`,
    );
  }

  test("opens in a sheet from the side by clicking a row on a desktop, and closes with Escape", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktops only");
    await openHistory(page);

    const time = await boxOf(
      rows(page)
        .first()
        .getByText(/^9:40\sPM$/),
    );

    await page.mouse.click(time.x + time.width / 2, time.y + time.height / 2);

    const sheet = page.getByRole("dialog", { name: "Reading sessions" });
    await expectSessionsIn(sheet);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });

  test("shows on a page of their own, with a way back to History", async ({
    page,
  }) => {
    await page.clock.setFixedTime(MONDAY_EVENING);
    await page.goto(`/history/${bookId(BOOK)}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Reading sessions" }),
    ).toBeVisible();
    await expectSessionsIn(page.getByRole("main"));
    await page.getByRole("link", { name: "Back to History" }).click();
    await expect(page).toHaveURL(/\/history$/);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the sheet or on the page in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.clock.setFixedTime(MONDAY_EVENING);
      if (isDesktop(page)) {
        await page.goto("/history");
        await page
          .getByRole("button", { name: /^Reading sessions of / })
          .first()
          .click();
      } else {
        await page.goto(`/history/${bookId(BOOK)}`);
      }
      await expect(
        page.getByRole("list", { name: "Sessions" }).getByRole("listitem"),
      ).toHaveCount(3);

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("a session's menu", () => {
  test.use({ backend: READ_BACKEND });

  function moreFor(page: Page, number: number): Locator {
    return page
      .getByRole("button", { name: `More for ${bookTitle(number)}` })
      .filter({ visible: true });
  }

  test("opens the book's reading sessions or its series from a menu on a desktop", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktops only");
    await openHistory(page);

    await moreFor(page, 4).click();
    await expect(page.getByRole("menuitem")).toHaveText([
      "Reading sessions",
      "Open series",
    ]);
    await page.getByRole("menuitem", { name: "Reading sessions" }).click();
    await expect(
      page.getByRole("dialog", { name: "Reading sessions" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await moreFor(page, 4).click();
    await page.getByRole("menuitem", { name: "Open series" }).click();

    await expect(page).toHaveURL(new RegExp(`/series/${seriesId(4)}$`));
  });

  test("opens the book's actions in a sheet from the bottom on a phone or tablet", async ({
    page,
  }) => {
    test.skip(isDesktop(page), "phones and tablets only");
    await openHistory(page);

    await moreFor(page, 7).click();

    const sheet = page.getByRole("dialog", { name: seriesTitle(7) });
    await expect(sheet.getByRole("link")).toHaveText([
      "Read again",
      "Reading sessions",
      "Open series",
    ]);
    await expect(
      sheet.getByRole("link", { name: "Reading sessions" }),
    ).toHaveAttribute("href", `/history/${bookId(7)}`);
    await expect(
      sheet.getByRole("link", { name: "Open series" }),
    ).toHaveAttribute("href", `/series/${seriesId(7)}`);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations with it open in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openHistory(page);

      await moreFor(page, 4).click();
      await expect(
        page.getByRole(isDesktop(page) ? "menu" : "dialog"),
      ).toBeVisible();
      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("with a series chosen", () => {
  test.use({
    backend: {
      ...READ_BACKEND,
      historySeries: () =>
        [1, 4, 7].map((number) => ({
          id: seriesId(number),
          title: seriesTitle(number),
        })),
      readingHistory: (after, of) =>
        pagedSessions(
          of.kind === "series"
            ? SESSIONS.filter((session) => session.series === of.series)
            : SESSIONS,
        )(after, of),
    },
  });

  test("shows only that series' sessions on a desktop, and every series again", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktops only");
    await openHistory(page);
    const chooser = page.getByRole("combobox", { name: "Show sessions from" });
    await expect(chooser.getByRole("option")).toHaveText([
      "All series",
      seriesTitle(1),
      seriesTitle(4),
      seriesTitle(7),
    ]);

    await chooser.selectOption({ label: seriesTitle(7) });

    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText(seriesTitle(7));
    await chooser.selectOption({ label: "All series" });
    await expect(rows(page)).toHaveCount(SESSIONS.length);
  });

  test("names every series by its stand-in with Screenshot mode on", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktops only");
    await page.addInitScript(() => {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({ activity: { kind: "on" } }),
      );
    });
    await openHistory(page);

    const options = page
      .getByRole("combobox", { name: "Show sessions from" })
      .getByRole("option");

    await expect(options).toHaveCount(4);
    await expect(options.filter({ hasText: "Sample Series" })).toHaveCount(0);
  });
});
