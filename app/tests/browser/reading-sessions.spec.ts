import type { Locator } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

type WireEntry = Awaited<
  ReturnType<FakeBackend["readingHistory"]>
>["entries"][number];

const MONDAY_EVENING = new Date("2026-10-05T22:30:00Z");
const MINUTE = 60;
const DAY_MS = 86_400_000;
const MONDAY = Date.UTC(2026, 9, 5) / DAY_MS;
const BOOK = 4;
const BOOK_ID = "0190a3e4-0000-8000-8000-000000000004";
const SERIES_ID = "0190a3e4-0000-8000-8001-000000000004";

function session(
  startedAt: string,
  minutes: number,
  page: number,
  dayMinutes: number,
): WireEntry {
  return {
    book: BOOK_ID,
    bookTitle: "Sample Series 04 v04",
    series: SERIES_ID,
    seriesTitle: "Sample Series 04",
    position: BOOK,
    cover: null,
    startedAtMs: Date.parse(startedAt),
    utcOffsetMinutes: 0,
    readSeconds: minutes * MINUTE,
    readTo: { state: "page", page, pageCount: 30 },
    reading: { state: "started", page },
    day: {
      day: Math.floor(Date.parse(startedAt) / DAY_MS),
      readSeconds: dayMinutes * MINUTE,
    },
  };
}

const SESSIONS = [
  session("2026-10-05T21:40:00.000Z", 24, 14, 52),
  session("2026-10-04T20:00:00.000Z", 50, 9, 70),
  session("2026-10-02T18:30:00.000Z", 38, 4, 38),
];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    readingHistory: () => ({ entries: SESSIONS, next: null }),
    bookSessions: () => ({
      sessions: 3,
      readSeconds: 112 * MINUTE,
      firstDay: MONDAY - 3,
      lastDay: MONDAY,
    }),
  },
});

async function expectSessionsIn(shown: Locator): Promise<void> {
  await expect(shown).toContainText("Sample Series 04");
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
  ).toHaveAttribute("href", `/series/${SERIES_ID}`);
  await expect(shown.getByRole("link", { name: "Continue" })).toHaveAttribute(
    "href",
    `/read/${BOOK_ID}`,
  );
}

test("shows a book's reading sessions on a page of their own, with a way back to History", async ({
  page,
}) => {
  await page.clock.setFixedTime(MONDAY_EVENING);
  await page.goto(`/history/${BOOK_ID}`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Reading sessions" }),
  ).toBeVisible();
  await expectSessionsIn(page.getByRole("main"));
  await page.getByRole("link", { name: "Back to History" }).click();
  await expect(page).toHaveURL(/\/history$/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.clock.setFixedTime(MONDAY_EVENING);
    await page.goto(`/history/${BOOK_ID}`);
    await expect(
      page.getByRole("list", { name: "Sessions" }).getByRole("listitem"),
    ).toHaveCount(3);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
