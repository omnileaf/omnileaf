import type { Page } from "@playwright/test";

import { type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";

type WireEntry = Awaited<
  ReturnType<FakeBackend["readingHistory"]>
>["entries"][number];

const THURSDAY_EVENING = new Date("2026-10-08T22:30:00Z");
const MINUTE = 60;
const DAY_MS = 86_400_000;
const FIRST_BOOK = 4;
const SECOND_BOOK = 1;
const THIRD_BOOK = 3;
const TOP_BAR_HEIGHT = 64;
const BAR_START = 12;
const BAR_END_INSET = 8;
const HEADING_START = 16;
const PHONE = { width: 390, height: 844 };

function entry(
  number: number,
  startedAt: string,
  readTo: WireEntry["readTo"],
): WireEntry {
  const id = String(number).padStart(12, "0");
  return {
    book: `0190a3e4-0000-8000-8000-${id}`,
    bookTitle: `Volume ${String(number)}`,
    series: `0190a3e4-0000-8000-8001-${id}`,
    seriesTitle: `Sample Series ${String(number).padStart(2, "0")}`,
    position: number,
    cover: null,
    startedAtMs: Date.parse(startedAt),
    utcOffsetMinutes: 0,
    readSeconds: 20 * MINUTE,
    readTo,
    reading: { state: "started", page: 14 },
    day: {
      day: Math.floor(Date.parse(startedAt) / DAY_MS),
      readSeconds: 20 * MINUTE,
    },
  };
}

const BOOKS: readonly WireEntry[] = [
  entry(FIRST_BOOK, "2026-10-08T21:40:00.000Z", {
    state: "page",
    page: 14,
    pageCount: 192,
  }),
  entry(SECOND_BOOK, "2026-10-07T22:05:00.000Z", {
    state: "page",
    page: 3,
    pageCount: 24,
  }),
  entry(THIRD_BOOK, "2026-10-05T19:30:00.000Z", {
    state: "page",
    page: 18,
    pageCount: 40,
  }),
];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    readingHistory: () => ({ entries: [...BOOKS], next: null }),
  },
});

async function openHistory(page: Page): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.clock.setFixedTime(THURSDAY_EVENING);
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { level: 1, name: "History" }),
  ).toBeVisible();
}

test.describe("History on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's top app bar");
  });

  test("draws a single 64px row with the title 12px from the start and the actions 8px from the end", async ({
    page,
  }) => {
    await openHistory(page);
    const title = page.getByRole("heading", { level: 1, name: "History" });
    const clear = page.getByRole("button", { name: "Clear History" });
    const titleBox = await title.boundingBox();
    const clearBox = await clear.boundingBox();

    expect(titleBox?.height).toBe(TOP_BAR_HEIGHT);
    expect(titleBox?.x).toBe(BAR_START);
    expect(PHONE.width - ((clearBox?.x ?? 0) + (clearBox?.width ?? 0))).toBe(
      BAR_END_INSET,
    );
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openHistory(page);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }

  test("sets the day headings in medium-weight muted text with no reading time", async ({
    page,
  }) => {
    await openHistory(page);
    const today = page.getByRole("heading", { level: 2, name: "Today" });

    await expect(today).toHaveCSS("font-weight", "500");
    await expect(today).toHaveCSS(
      "color",
      await tokenColour(page, "--secondary-text"),
    );
    await expect(today).toHaveCSS("font-size", "14px");
    await expect(today).toHaveCSS("line-height", "20px");
    expect((await today.boundingBox())?.x).toBe(HEADING_START);
    await expect(page.getByTestId("group-total")).toHaveCount(0);
  });
});
