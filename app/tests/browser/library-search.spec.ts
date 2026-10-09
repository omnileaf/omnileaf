import type { Locator, Page } from "@playwright/test";

import {
  type LibrarySearch,
  SEARCH_MAX_CHARS,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  LARGE_MIN_WIDTH,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import type { WireSeries } from "./series-catalog.ts";

interface FakeSeries {
  readonly series: WireSeries;
  readonly isStarted: boolean;
}

function fakeSeries(
  number: number,
  title: string,
  { unread, isStarted }: { unread: number; isStarted: boolean },
): FakeSeries {
  return {
    series: {
      id: `0190a3e4-0000-8000-8000-${String(number).padStart(12, "0")}`,
      title,
      bookCount: 2,
      unreadCount: unread,
      cover: null,
    },
    isStarted,
  };
}

const CATALOG: readonly FakeSeries[] = [
  fakeSeries(1, "Harbour Gate", { unread: 2, isStarted: false }),
  fakeSeries(2, "Lantern Market", { unread: 1, isStarted: true }),
  fakeSeries(3, "Market Lanterns", { unread: 2, isStarted: false }),
  fakeSeries(4, "Sample Series 04", { unread: 0, isStarted: true }),
];

/** Finds the series holding every word typed and meeting each condition, as the engine would, on one page. */
function found(search: LibrarySearch): WireSeries[] {
  const words = search.text.toLowerCase().split(/\s+/).filter(Boolean);
  const meets = (inclusion: string, holds: boolean) =>
    inclusion === "any" || holds === (inclusion === "only");
  return CATALOG.filter(
    ({ series, isStarted }) =>
      words.every((word) => series.title.toLowerCase().includes(word)) &&
      meets(search.filter.unread, series.unreadCount > 0) &&
      meets(search.filter.started, isStarted) &&
      meets(search.filter.finished, series.unreadCount === 0),
  )
    .map(({ series }) => series)
    .toSorted((one, other) => one.title.localeCompare(other.title));
}

const SEARCHING_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: () => ({
    series: CATALOG.map(({ series }) => series),
    next: null,
  }),
  librarySearch: (_after, search) => ({ series: found(search), next: null }),
  librarySearchCount: (search) => found(search).length,
};

test.use({ backend: SEARCHING_BACKEND });

function isDesktop(page: Page): boolean {
  return viewportOf(page).width >= LARGE_MIN_WIDTH;
}

function isPhone(page: Page): boolean {
  return viewportOf(page).width < MEDIUM_MIN_WIDTH;
}

function searchField(page: Page): Locator {
  return page
    .getByRole("main")
    .getByRole("combobox", { name: "Search your library" });
}

function results(page: Page): Locator {
  return page.getByRole("listbox", { name: "Series found" });
}

async function openSearch(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(
    CATALOG.length,
  );
  if (isDesktop(page)) {
    await page
      .getByRole("searchbox", { name: "Search the library" })
      .pressSequentially("l");
  } else {
    await page.getByRole("link", { name: "Search", exact: true }).click();
  }
  await expect(searchField(page)).toBeFocused();
}

async function expectFound(page: Page, titles: readonly string[]) {
  await expect(results(page).getByRole("option")).toHaveText(
    titles.map((title) => new RegExp(title)),
  );
}

test("opens the search page from the library's header with its field ready to type in", async ({
  page,
}) => {
  await openSearch(page);

  await expect(page).toHaveURL(/\/search/);
  await expect(page.getByRole("link", { name: "Library" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("shows what can be searched before anything is typed", async ({
  page,
}) => {
  await page.goto("/search");

  await expect(
    page.getByRole("heading", { level: 2, name: "Search by" }),
  ).toBeVisible();
  await expect(page.getByText("Title or series")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Type to filter" }),
  ).toBeVisible();
  await expect(page.getByText("→ only unread")).toBeVisible();
});

test("finds the series whose titles hold every word typed, and counts them", async ({
  page,
}) => {
  await page.goto("/search");

  await searchField(page).fill("market lantern");

  await expectFound(page, ["Lantern Market", "Market Lanterns"]);
  await expect(page.getByRole("heading", { name: "Series · 2" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    "2 series found",
  );
});

test("carries on the search typed into the library's header on desktop", async ({
  page,
}) => {
  test.skip(!isDesktop(page), "desktop only");
  await openSearch(page);

  await page.keyboard.type("antern");

  await expect(searchField(page)).toHaveValue("lantern");
  await expectFound(page, ["Lantern Market", "Market Lanterns"]);
});

test("carries on no more of the header's text than a search reads", async ({
  page,
}) => {
  test.skip(!isDesktop(page), "desktop only");
  await page.goto("/");

  await page
    .getByRole("searchbox", { name: "Search the library" })
    .fill("l".repeat(SEARCH_MAX_CHARS + 1));

  await expect(searchField(page)).toHaveValue("l".repeat(SEARCH_MAX_CHARS));
});

test("turns a filter word followed by a space into a filter", async ({
  page,
}) => {
  await page.goto("/search");

  await searchField(page).pressSequentially("unread market");

  await expect(searchField(page)).toHaveValue("market");
  await expect(
    page.getByRole("button", { name: "Remove the Unread filter" }),
  ).toBeVisible();
  await expectFound(page, ["Lantern Market", "Market Lanterns"]);
});

test("drops a filter with its remove button, or with backspace in an empty field", async ({
  page,
}) => {
  await page.goto("/search");
  await searchField(page).pressSequentially("started finished ");
  await expectFound(page, ["Sample Series 04"]);

  await page.getByRole("button", { name: "Remove the Started filter" }).click();
  await searchField(page).press("Backspace");

  await expect(page.getByRole("button", { name: /^Remove the/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { name: "Search by" })).toBeVisible();
});

test("shows only the series meeting the condition chosen", async ({ page }) => {
  await page.goto("/search");
  await searchField(page).fill("market");
  const show = page.getByRole("group", { name: "Show" });

  await show.getByRole("button", { name: "Started" }).click();

  await expect(
    page.getByRole("button", { name: "Remove the Started filter" }),
  ).toBeVisible();
  await expectFound(page, ["Lantern Market"]);
});

test("keeps the boxes of the Show choices still as they are pressed", async ({
  page,
}) => {
  test.skip(
    isPhone(page),
    "phones swap the choices for the chosen filters once one is pressed",
  );
  await page.goto("/search");
  await searchField(page).fill("market");
  await expectFound(page, ["Lantern Market", "Market Lanterns"]);
  const choices = page.getByRole("group", { name: "Show" }).getByRole("button");
  const boxesOf = async () => {
    const boxes = [];
    for (const choice of await choices.all()) {
      boxes.push(await boxOf(choice));
    }
    return boxes;
  };
  const before = await boxesOf();

  for (const name of ["Unread", "Started", "Everything"]) {
    await choices.filter({ hasText: name }).click();
    await expect(choices.filter({ hasText: name })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await boxesOf()).toEqual(before);
  }
});

test("names the field's clear button and each filter's remove button in a tooltip", async ({
  page,
}) => {
  test.skip(isDesktop(page), "the clear button shows on phones and tablets");
  await page.goto("/search");

  await searchField(page).pressSequentially("unread market");

  await expect(
    page.getByRole("button", { name: "Clear", exact: true }),
  ).toHaveAttribute("title", "Clear");
  await expect(
    page.getByRole("button", { name: "Remove the Unread filter" }),
  ).toHaveAttribute("title", "Remove the Unread filter");
});

test("draws Close beside the field at the 40px height the desktop board gives it", async ({
  page,
}) => {
  test.skip(!isDesktop(page), "desktop only");
  await page.goto("/search");

  const close = await boxOf(page.getByRole("link", { name: "Close" }));

  expect(close.height).toBe(40);
});

test("moves through the results with the arrow keys, Home and End, and opens one with Enter", async ({
  page,
}) => {
  test.skip(!isDesktop(page), "desktop only");
  await page.goto("/search");
  await searchField(page).fill("a");
  await expectFound(page, [
    "Harbour Gate",
    "Lantern Market",
    "Market Lanterns",
    "Sample Series 04",
  ]);
  const options = results(page).getByRole("option");
  const active = async () => {
    const id = await searchField(page).getAttribute("aria-activedescendant");
    return id === null
      ? undefined
      : await page.locator(`[id="${id}"]`).textContent();
  };

  const visited: (string | null | undefined)[] = [];
  for (const key of [
    "ArrowDown",
    "ArrowRight",
    "ArrowLeft",
    "ArrowDown",
    "ArrowUp",
    "End",
    "Home",
  ]) {
    await searchField(page).press(key);
    visited.push(await active());
  }

  expect(visited.map((text) => text?.match(/^\s*(\D+)/)?.[1]?.trim())).toEqual([
    "Harbour Gate",
    "Lantern Market",
    "Harbour Gate",
    "Sample Series",
    "Harbour Gate",
    "Sample Series",
    "Harbour Gate",
  ]);
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await searchField(page).press("ArrowRight");
  await searchField(page).press("Enter");
  await expect(page).toHaveURL(/\/search\?title=Lantern\+Market$/);
  await expect(searchField(page)).toHaveValue("Lantern Market");
});

test("moves the caret, not the results, once more is typed", async ({
  page,
}) => {
  test.skip(!isDesktop(page), "desktop only");
  await page.goto("/search");
  await searchField(page).fill("a");
  await expect(results(page).getByRole("option")).toHaveCount(4);
  await searchField(page).press("ArrowDown");

  await searchField(page).press("r");

  await expect(searchField(page)).not.toHaveAttribute("aria-activedescendant");
  await expect(
    results(page).getByRole("option", { selected: true }),
  ).toHaveCount(0);
});

test("lists the keys the results answer to under the desktop page", async ({
  page,
}) => {
  test.skip(!isDesktop(page), "desktop only");
  await page.goto("/search");

  const hints = page.getByRole("main").locator("footer");

  await expect(hints).toContainText("↑ ↓ to move");
  await expect(hints).toContainText("Enter to open");
  await expect(hints).toContainText("Ctrl K for quick open, anywhere");
});

for (const [asked, shown] of [
  ["Lantern+Market", ""],
  ["Series+123", "Series 123"],
] as const) {
  test(`shows a title from before Screenshot mode only when it is a stand-in, here ${shown === "" ? "nothing" : shown}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({ activity: { kind: "on" } }),
      );
    });

    await page.goto(`/search?title=${asked}`);

    await expect(searchField(page)).toHaveValue(shown);
    await expect(page.getByRole("main")).not.toContainText("Lantern Market");
  });
}

test("says when nothing is called what was typed", async ({ page }) => {
  await page.goto("/search");

  await searchField(page).fill("harbor gait");

  await expect(
    page.getByRole("heading", { name: "Nothing called “harbor gait”" }),
  ).toBeVisible();
  await expect(results(page)).toHaveCount(0);
});

test("goes back to the library from the search page", async ({ page }) => {
  await openSearch(page);

  if (isDesktop(page)) {
    await searchField(page).press("Escape");
  } else {
    await page
      .getByRole("link", { name: isPhone(page) ? "Cancel" : "Close" })
      .click();
  }

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeFocused();
});

test("keeps the search page inside the screen from right to left", async ({
  page,
}) => {
  await page.goto("/search");
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });

  await searchField(page).fill("market");

  await expectFound(page, ["Lantern Market", "Market Lanterns"]);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the search page has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/search");
    await searchField(page).pressSequentially("unread market");
    await expectFound(page, ["Lantern Market", "Market Lanterns"]);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });

  test(`the search page before typing has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/search");
    await expect(page.getByText("Title or series")).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
