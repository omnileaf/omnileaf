import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  LARGE_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
  NOT_STARTED,
  PAGE_COUNT,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const DENSE_BUTTON = 44;
const DESKTOP_BUTTON = 36;
const SERIES_CRUMB_CAP = 220;
const BELOW_LARGE = { width: 1000, height: 800 };
const LONG_SERIES_TITLE = "A Series Whose Title Runs Well Past Its Crumb";

const marked: { books: readonly string[]; mark: string }[] = [];

test.use({
  backend: {
    ...readerBackend(DEFAULT_BACKEND),
    markBooks: (books, mark) => {
      marked.push({ books, mark });
      return null;
    },
  },
});

test.beforeEach(() => {
  marked.length = 0;
});

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

function quickSettings(page: Page): Locator {
  return page.getByRole("group", { name: "Quick settings" });
}

function direction(page: Page): Locator {
  return quickSettings(page).getByRole("button", { name: /^Left to right/ });
}

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

async function openMore(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "More", exact: true }).click();
  return isWide(page) ? page.getByRole("menu") : page.getByRole("dialog");
}

test("shows AUTO on the direction button while the direction is left to the app", async ({
  page,
}) => {
  await openBook(page);

  await expect(direction(page).getByText("AUTO")).toBeVisible();
  await direction(page).click();
  await page
    .getByRole("menuitemradio", { name: "Left to right", exact: true })
    .click();

  await expect(direction(page).getByText("AUTO")).toBeHidden();
  await expect(direction(page)).toHaveAccessibleName("Left to right");
});

test("offers Automatic with the way it reads, and says the choice is remembered", async ({
  page,
}) => {
  await openBook(page);

  await direction(page).click();

  await expect(
    page.getByRole("menuitemradio", { name: "Automatic (left to right)" }),
  ).toBeChecked();
  await expect(page.getByRole("menu")).toContainText(
    `Remembered for ${BOOK_SERIES_TITLE}.`,
  );
});

test("names the series and the book with the page in the top bar", async ({
  page,
}) => {
  await openBook(page);
  const bar = page.locator("main header");

  await expect(bar).toContainText(BOOK_SERIES_TITLE);
  if (!isWide(page)) {
    await expect(bar).toContainText(
      `${BOOK_TITLE} · Page 1 of ${String(PAGE_COUNT)}`,
    );
  }
});

test("sizes the bar's buttons as the boards do", async ({ page }) => {
  await openBook(page);
  const size = isWide(page) ? DESKTOP_BUTTON : DENSE_BUTTON;

  for (const name of ["Reading settings", "More"]) {
    const box = await boxOf(page.getByRole("button", { name, exact: true }));
    expect([box.width, box.height]).toEqual([size, size]);
  }
});

test("joins the quick settings into one group of outlined buttons", async ({
  page,
}) => {
  await openBook(page);
  const buttons = quickSettings(page).getByRole("button");
  const names = isWide(page)
    ? [/^Left to right/, /^Two pages/, /^Fit height/, /^Light/]
    : [/^Left to right/, /^Two pages/, /^Light/];

  await expect(buttons).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(buttons.nth(index)).toHaveAccessibleName(name);
  }
  const first = await boxOf(buttons.nth(0));
  const second = await boxOf(buttons.nth(1));
  expect(Math.round(second.x - (first.x + first.width))).toBe(-1);
});

test.describe("in a window narrower than a large screen", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      openBook: () => ({
        ...readerBook(NOT_STARTED),
        seriesTitle: LONG_SERIES_TITLE,
      }),
    },
  });

  test("keeps the quick settings above the slider, leaving the crumbs their room", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < LARGE_MIN_WIDTH,
      "a desktop window narrowed below a large screen",
    );
    await page.setViewportSize(BELOW_LARGE);
    await openBook(page);
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });

    await expect(
      page.locator("main > header").getByRole("group", {
        name: "Quick settings",
      }),
    ).toBeHidden();
    await expect(
      page
        .locator("main > div:has(input[type=range])")
        .getByRole("group", { name: "Quick settings" })
        .getByRole("button"),
    ).toHaveText([/^\s*Left to right/, "Two pages", "Fit height", "Light"]);
    const seriesCrumb = await boxOf(
      crumbs.getByRole("link", { name: LONG_SERIES_TITLE, exact: true }),
    );
    expect(seriesCrumb.width).toBe(SERIES_CRUMB_CAP);
  });
});

test("starts the book over from More", async ({ page }) => {
  await openBook(page);
  await page.keyboard.press("End");
  await page.keyboard.press("m");

  const more = await openMore(page);
  await more
    .getByRole(isWide(page) ? "menuitem" : "button", {
      name: "Start over",
    })
    .click();

  await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
    "aria-valuetext",
    `Page 1 of ${String(PAGE_COUNT)}`,
  );
});

test("marks the book read from More", async ({ page }) => {
  await openBook(page);

  const more = await openMore(page);
  await more
    .getByRole(isWide(page) ? "menuitem" : "button", {
      name: "Mark read",
    })
    .click();

  await expect.poll(() => marked).toEqual([{ books: [BOOK_ID], mark: "read" }]);
});

test("goes back to the library from More, past the series", async ({
  page,
}) => {
  await openBook(page);

  const more = await openMore(page);
  await more
    .getByRole(isWide(page) ? "menuitem" : "link", {
      name: "Back to the library",
    })
    .click();

  await expect(page).toHaveURL(/\/$/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the reader's bars have no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openBook(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test("lays the page slider's track along the slider", async ({ page }) => {
  await openBook(page);
  const slider = page.getByRole("slider", { name: "Page" });
  const track = slider.locator("xpath=../div").first();

  const along = await boxOf(slider);
  const drawn = await boxOf(track);

  expect([drawn.x, drawn.width]).toEqual([along.x, along.width]);
});
