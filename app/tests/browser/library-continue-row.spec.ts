import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  LARGE_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { choose, openViewOptions } from "./view-options.ts";

type WireEntry = Awaited<
  ReturnType<FakeBackend["readingHistory"]>
>["entries"][number];

const STARTED = 5;
const LONG_NAME =
  "Attack on Titan v01-v30 (Digital) (LostNerevarine+Hexer+danke-Empire) ".repeat(
    2,
  );

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
  return `${seriesTitle(number)} v01`;
}

function unfinished(number: number): WireEntry {
  return {
    book: bookId(number),
    bookTitle: bookTitle(number),
    series: seriesId(number),
    seriesTitle: seriesTitle(number),
    position: 1,
    cover: null,
    startedAtMs: Date.UTC(2026, 9, 5, 20 - number),
    utcOffsetMinutes: 0,
    readSeconds: 600,
    readTo: { state: "page", page: 10 + number, pageCount: 40 },
    reading: { state: "started", page: 10 + number },
    day: { day: 20_731, readSeconds: 600 },
  };
}

const ENTRIES = Array.from({ length: STARTED }, (_, index) =>
  unfinished(index + 1),
);

let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;
let entries: readonly WireEntry[] = ENTRIES;
const askedFor: string[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => sampleSeries(12)),
    libraryView: () => storedView,
    setLibraryView: (view) => {
      storedView = view;
      return null;
    },
    readingHistory: (_after, of) => {
      askedFor.push(of.kind);
      return {
        entries: of.kind === "unfinished" ? [...entries] : [],
        next: null,
      };
    },
  },
});

test.beforeEach(() => {
  storedView = DEFAULT_LIBRARY_VIEW;
  entries = ENTRIES;
  askedFor.length = 0;
});

function continueRow(page: Page): Locator {
  return page.getByRole("region", { name: "Continue reading" });
}

function cards(page: Page): Locator {
  return continueRow(page).getByRole("listitem");
}

async function openWithTheRow(page: Page): Promise<void> {
  storedView = { ...DEFAULT_LIBRARY_VIEW, showsContinueRow: true };
  await page.goto("/");
  await expect(cards(page)).toHaveCount(STARTED);
}

test("keeps the Continue reading row off until it's turned on in View options", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(continueRow(page)).toHaveCount(0);
  expect(askedFor).not.toContain("unfinished");
  const options = await openViewOptions(page);
  const onThePage = options.getByRole("group", {
    name: "On the library page",
  });
  await expect(onThePage.getByLabel("Continue reading row")).not.toBeChecked();

  await choose(onThePage, "Continue reading row");

  await expect(onThePage.getByLabel("Continue reading row")).toBeChecked();
  await expect.poll(() => storedView.showsContinueRow).toBe(true);
  await page.keyboard.press("Escape");
  await expect(cards(page)).toHaveCount(STARTED);
});

test("shows each book started and not finished, last read first, with its progress and a play button", async ({
  page,
}) => {
  await openWithTheRow(page);

  const first = cards(page).first();
  await expect(first).toContainText(seriesTitle(1));
  await expect(first).toContainText(bookTitle(1));
  await expect(first).toContainText("11 / 40");
  await expect(
    first.getByRole("progressbar", { name: "Page 11 of 40" }),
  ).toBeVisible();
  await expect(
    first.getByRole("link", {
      name: `Continue ${seriesTitle(1)}, ${bookTitle(1)}`,
    }),
  ).toHaveAttribute("href", `/read/${bookId(1)}`);
  await expect(
    first.getByRole("link", { name: new RegExp(`^${seriesTitle(1)}`) }),
  ).toHaveAttribute("href", `/series/${seriesId(1)}`);
  await expect(cards(page).last()).toContainText(seriesTitle(STARTED));
});

test("scrolls the cards sideways on phones and tablets, and pages through three at a time with arrows on a desktop", async ({
  page,
}) => {
  await openWithTheRow(page);
  const list = continueRow(page).getByRole("list");
  const previous = continueRow(page).getByRole("button", { name: "Previous" });
  const next = continueRow(page).getByRole("button", { name: "Next" });

  const overflows = await list.evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  );

  expect(overflows).toBe(true);
  if (viewportOf(page).width < LARGE_MIN_WIDTH) {
    await expect(next).toBeHidden();
    return;
  }
  const shown = await cards(page).evaluateAll(
    (elements, edge) => {
      const listEnd = edge;
      return elements.filter(
        (element) => element.getBoundingClientRect().right <= listEnd + 1,
      ).length;
    },
    await list.evaluate((element) => element.getBoundingClientRect().right),
  );
  expect(shown).toBe(3);
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();
});

test("keeps the play button whole beside a long series and book name", async ({
  page,
}) => {
  entries = ENTRIES.map((entry) => ({
    ...entry,
    seriesTitle: LONG_NAME,
    bookTitle: LONG_NAME,
  }));
  await openWithTheRow(page);

  const first = cards(page).first();
  const card = await first.boundingBox();
  const play = await first
    .getByRole("link", { name: /^Continue / })
    .boundingBox();

  expect(card).not.toBeNull();
  expect(play).not.toBeNull();
  if (card !== null && play !== null) {
    expect(play.x + play.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
    expect(play.width).toBeGreaterThan(30);
  }
});

test("names every series and book by its stand-in with Screenshot mode on", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "omnileaf.screenshotMode",
      JSON.stringify({ activity: { kind: "on" } }),
    );
  });
  await openWithTheRow(page);

  await expect(cards(page).filter({ hasText: "Sample Series" })).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no accessibility violations with the row on in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openWithTheRow(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
