import type { Locator, Page } from "@playwright/test";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  LARGE_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";

type WireEntry = Awaited<
  ReturnType<FakeBackend["readingHistory"]>
>["entries"][number];

const MONDAY_EVENING = new Date("2026-10-05T22:30:00Z");
const MINUTE = 60;
const READ_THIS_WEEK = 3 * 60 * MINUTE + 12 * MINUTE;
const ENTRIES_PER_PAGE = 50;
const DAY_MS = 86_400_000;

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
    seriesTitle: seriesTitle(number),
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

/** Lists whatever `sessions` holds when asked, a page at a time, with each page's start as its cursor. */
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
  readingTimeSince: () => READ_THIS_WEEK,
};

function isDesktop(page: Page): boolean {
  return viewportOf(page).width >= LARGE_MIN_WIDTH;
}

function days(page: Page): Locator {
  return page.getByRole("main").getByRole("region");
}

function rows(page: Page): Locator {
  return days(page).getByRole("listitem");
}

async function openHistory(page: Page): Promise<void> {
  await page.clock.setFixedTime(MONDAY_EVENING);
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { level: 1, name: "History" }),
  ).toBeVisible();
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
    await expect(page.getByText(/read this week/)).toHaveCount(0);
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
        .getByRole("region", { name: "Tuesday 1 h 10 min" })
        .getByRole("listitem"),
    ).toHaveCount(1);
    await expect(rows(page).first()).toContainText(seriesTitle(4));
    await expect(rows(page).last()).toContainText(seriesTitle(6));
  });

  test("says how long was read this week", async ({ page }) => {
    await openHistory(page);

    await expect(page.getByText("3 h 12 min read this week")).toBeVisible();
  });

  test("says where each session left its book, when it began and how long it went on", async ({
    page,
  }) => {
    await openHistory(page);

    const first = rows(page).first();
    await expect(first).toContainText(`${bookTitle(4)} · page 14 of 30`);
    await expect(rows(page).nth(1)).toContainText(`${bookTitle(7)} · finished`);
    if (isDesktop(page)) {
      await expect(first).toContainText(/9:40\sPM/);
      await expect(first).toContainText("Read for 24 min");
    } else {
      await expect(first).toContainText(/9:40\sPM · read for 24 min/);
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
