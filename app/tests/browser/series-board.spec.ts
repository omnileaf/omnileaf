import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  expect,
  EXPANDED_MIN_WIDTH,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  FakeShelf,
  SERIES_ID,
  SERIES_TITLE,
  type SeriesDetails,
} from "./series-shelf.ts";

const READ = { state: "read" } as const;
const NOT_STARTED = { state: "notStarted" } as const;
const ON_PAGE_14 = { state: "started", page: 14 } as const;
const PAGE_COUNT = 192;
const EIGHT_BOOKS = [
  READ,
  READ,
  ON_PAGE_14,
  ...Array.from({ length: 5 }, () => NOT_STARTED),
];
const SUMMARY =
  "A lighthouse keeper’s apprentice spends a winter at the harbour gate, writing letters to a sister across the northern sea. Every letter comes back unopened, and every spring the ice breaks a little later, until the keeper stops counting the days and starts counting the ships that never arrive at the harbour.";
const TAGS = ["Slice of life", "Seinen", "Sea", "Letters"];
const ONE_CREATOR: Partial<SeriesDetails> = {
  format: "Manga",
  creators: [{ name: "Author A", role: "storyAndArt" }],
  summary: SUMMARY,
  tags: TAGS,
};
const FOUR_CREATORS = [
  { name: "Author A", role: "story" },
  { name: "Author B", role: "story" },
  { name: "Author C", role: "art" },
  { name: "Author D", role: "art" },
] as const;
const TITLE_SIZE = "24px";
const PHONE_BAND = { height: 240 };
const DESKTOP_BAND = { width: 380, height: 220 };
const TOOLBAR_HEIGHT = 56;
const ASIDE_WIDTH = 280;
const CHIP_SIZE = 48;

function shelfBackend(shelf: FakeShelf): FakeBackend {
  return shelf.backend();
}

function hasToolbar(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

function title(page: Page): Locator {
  return page.getByRole("heading", { level: 1 });
}

function about(page: Page): Locator {
  return page.getByRole("region", { name: "About this series" });
}

function continueCard(page: Page): Locator {
  return page.getByRole("region", { name: /^(Continue|Up next|You’ve read)/ });
}

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(title(page)).toBeVisible();
}

test.describe("a series with one creator, a summary and tags", () => {
  test.use({
    backend: shelfBackend(new FakeShelf(EIGHT_BOOKS, ONE_CREATOR, PAGE_COUNT)),
  });

  test("names the series in 24px bold type", async ({ page }) => {
    await openSeries(page);

    await expect(title(page)).toHaveText(SERIES_TITLE);
    await expect(title(page)).toHaveCSS("font-size", TITLE_SIZE);
    await expect(title(page)).toHaveCSS("font-weight", "700");
  });

  test("credits one creator of story and art with By", async ({ page }) => {
    await openSeries(page);

    await expect(about(page).getByText("By Author A")).toBeVisible();
  });

  test("puts the format beside the number of books", async ({ page }) => {
    await openSeries(page);

    await expect(about(page).getByText("Manga · 8 books")).toBeVisible();
  });

  test("folds the summary to two lines, with More to read it all", async ({
    page,
  }) => {
    await openSeries(page);
    const summary = about(page).getByText(SUMMARY);
    const more = about(page).getByRole("button", { name: "More" });
    const lineHeight = await summary.evaluate((element) =>
      parseFloat(getComputedStyle(element).lineHeight),
    );

    expect((await boxOf(summary)).height).toBeLessThanOrEqual(
      lineHeight * 2 + 1,
    );
    await more.click();

    await expect(
      about(page).getByRole("button", { name: "Less" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect((await boxOf(summary)).height).toBeGreaterThan(lineHeight * 2 + 1);
  });

  test("tags the series with a badge for each tag", async ({ page }) => {
    await openSeries(page);

    await expect(
      about(page).getByRole("list", { name: "Tags" }).getByRole("listitem"),
    ).toHaveText(TAGS);
  });

  test("lists the series' details", async ({ page }) => {
    await openSeries(page);
    const details = about(page).getByRole("button", {
      name: "Details",
      exact: true,
    });
    if (await details.isVisible()) {
      await details.click();
    }

    const list = about(page).getByRole("definition");
    await expect(about(page).getByRole("term")).toHaveText([
      "Title",
      "Story and art",
      "Format",
    ]);
    await expect(list).toHaveText([SERIES_TITLE, "Author A", "Manga"]);
  });

  test("offers to continue the book reading goes on from in a card", async ({
    page,
  }) => {
    await openSeries(page);
    const card = continueCard(page);

    await expect(card.getByRole("heading", { name: "Continue" })).toBeVisible();
    await expect(card).toContainText("Sample Series 04 v03, page 14 of 192");
    await expect(
      card.getByRole("link", {
        name: "Continue Sample Series 04 v03 at page 14",
      }),
    ).toBeVisible();
    await expect(
      card.getByRole("progressbar", { name: "2 of 8 read" }),
    ).toHaveAttribute("aria-valuenow", "2");
  });

  test("marks every book read from the button beside the details", async ({
    page,
  }) => {
    await openSeries(page);

    await expect(
      about(page).getByRole("button", { name: /Mark .*read/ }),
    ).toBeVisible();
  });

  test("lays the band of the cover's colour behind the cover", async ({
    page,
  }) => {
    await openSeries(page);
    const band = page.locator("[data-series-band]");
    const cover = await boxOf(about(page).getByRole("img").first());

    const drawn = await boxOf(band);

    if (hasToolbar(page)) {
      const toolbar = await boxOf(page.locator("[data-page-toolbar]"));
      expect(drawn.y).toBe(toolbar.y + toolbar.height);
      expect(drawn.width).toBe(DESKTOP_BAND.width);
      expect(drawn.height).toBe(DESKTOP_BAND.height);
    } else {
      const main = page.getByRole("main");
      const area = await boxOf(main);
      const areaWidth = await main.evaluate((element) => element.clientWidth);
      expect(drawn.y).toBe(0);
      expect(drawn.height).toBe(PHONE_BAND.height);
      expect({ start: drawn.x, end: drawn.x + drawn.width }).toEqual({
        start: area.x,
        end: area.x + areaWidth,
      });
      const column = await boxOf(about(page));
      expect(cover.x + cover.width / 2).toBeCloseTo(
        column.x + column.width / 2,
        0,
      );
    }
    expect(cover.y).toBeLessThan(drawn.y + drawn.height);
  });

  test("puts the way back and the page's name in a 56px toolbar on desktops", async ({
    page,
  }) => {
    await openSeries(page);
    test.skip(!hasToolbar(page), "the desktop's toolbar");
    const toolbar = page.locator("[data-page-toolbar]");

    const bar = await boxOf(toolbar);

    expect(bar.height).toBe(TOOLBAR_HEIGHT);
    const crumbs = toolbar.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByRole("link", { name: "Library" })).toBeVisible();
    await expect(crumbs.getByText(SERIES_TITLE)).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect((await boxOf(about(page))).width).toBe(ASIDE_WIDTH);
  });

  test("keeps the way back and the series' actions on round chips over the band on phones", async ({
    page,
  }) => {
    await openSeries(page);
    test.skip(
      viewportOf(page).width >= MEDIUM_MIN_WIDTH,
      "the phone's bar over the band",
    );
    const back = page.getByRole("link", { name: "Back to the library" });
    const more = page.getByRole("button", { name: `More for ${SERIES_TITLE}` });

    for (const chip of [back, more]) {
      const box = await boxOf(chip);
      expect([box.width, box.height]).toEqual([CHIP_SIZE, CHIP_SIZE]);
    }
    await more.click();
    await expect(
      page.getByRole("menuitem", { name: "Mark every book read" }),
    ).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the series' details have no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openSeries(page);

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("a series with creators in two roles", () => {
  test.use({
    backend: shelfBackend(
      new FakeShelf(EIGHT_BOOKS, {
        format: "Light novel",
        creators: [...FOUR_CREATORS],
      }),
    ),
  });

  test("credits the first creator of each role, then says how many more", async ({
    page,
  }) => {
    await openSeries(page);

    await expect(about(page)).toContainText("Story: Author A · Art: Author C");
    await about(page)
      .getByRole("button", { name: "Show all 4 creators in Details" })
      .click();

    await expect(about(page).getByRole("term")).toHaveText([
      "Title",
      "Story",
      "Art",
      "Format",
    ]);
    await expect(about(page).getByRole("definition")).toHaveText([
      SERIES_TITLE,
      "Author A, Author B",
      "Author C, Author D",
      "Light novel",
    ]);
  });
});

test.describe("a series whose creators have no roles", () => {
  test.use({
    backend: shelfBackend(
      new FakeShelf(EIGHT_BOOKS, {
        creators: FOUR_CREATORS.map(({ name }) => ({ name, role: null })),
      }),
    ),
  });

  test("credits the first two by name, then says how many more", async ({
    page,
  }) => {
    await openSeries(page);

    await expect(about(page)).toContainText("By Author A, Author B");
    await expect(
      about(page).getByRole("button", {
        name: "Show all 4 creators in Details",
      }),
    ).toHaveText("+2 more");
  });
});

test.describe("a series the library knows nothing more about", () => {
  test.use({ backend: shelfBackend(new FakeShelf(EIGHT_BOOKS)) });

  test("leaves out the credits, summary and tags", async ({ page }) => {
    await openSeries(page);

    await expect(about(page).getByText(/^By /)).toHaveCount(0);
    await expect(about(page).getByRole("button", { name: "More" })).toHaveCount(
      0,
    );
    await expect(about(page).getByRole("list", { name: "Tags" })).toHaveCount(
      0,
    );
    await expect(
      about(page).getByText("8 books", { exact: true }),
    ).toBeVisible();
  });

  test("says what's next without a page count it doesn't have", async ({
    page,
  }) => {
    await openSeries(page);

    await expect(
      continueCard(page).getByText("Sample Series 04 v03, page 14", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("a series not started", () => {
  test.use({
    backend: shelfBackend(
      new FakeShelf(
        Array.from({ length: 3 }, () => NOT_STARTED),
        {},
        PAGE_COUNT,
      ),
    ),
  });

  test("offers to start with its first book", async ({ page }) => {
    await openSeries(page);
    const card = continueCard(page);

    await expect(card.getByRole("heading", { name: "Up next" })).toBeVisible();
    await expect(card).toContainText(
      "Sample Series 04 v01 · 192 pages · unread",
    );
    await expect(
      card.getByRole("link", { name: "Start with Sample Series 04 v01" }),
    ).toBeVisible();
  });
});

test.describe("a series read to the end", () => {
  test.use({
    backend: shelfBackend(
      new FakeShelf(
        Array.from({ length: 3 }, () => READ),
        {},
        PAGE_COUNT,
      ),
    ),
  });

  test("says every book is read, with nothing to continue", async ({
    page,
  }) => {
    await openSeries(page);
    const card = continueCard(page);

    await expect(
      card.getByRole("heading", {
        name: "You’ve read every book in this series",
      }),
    ).toBeVisible();
    await expect(card).toContainText("New books in its folder show up here.");
    await expect(card.getByRole("link")).toHaveCount(0);
  });
});

test.describe("a series with details while Screenshot mode is on", () => {
  test.use({
    backend: shelfBackend(
      new FakeShelf(EIGHT_BOOKS, {
        ...ONE_CREATOR,
        creators: [...FOUR_CREATORS],
      }),
    ),
  });

  test("shows stand-ins for its creators, summary and tags", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({ activity: { kind: "on" } }),
      );
    });
    await openSeries(page);

    const shown = (await about(page).textContent()) ?? "";
    for (const own of [...FOUR_CREATORS.map(({ name }) => name), ...TAGS]) {
      expect(shown).not.toContain(own);
    }
    expect(shown).not.toContain(SUMMARY);
    await expect(about(page)).toContainText(
      "Story: Creator 1 · Art: Creator 3",
    );
    await expect(
      about(page).getByRole("list", { name: "Tags" }).getByRole("listitem"),
    ).toHaveText(["Tag 1", "Tag 2", "Tag 3", "Tag 4"]);
  });
});
