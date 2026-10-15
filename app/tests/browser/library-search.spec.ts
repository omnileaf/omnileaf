import type { Locator, Page } from "@playwright/test";

import {
  type LibrarySearch,
  SEARCH_MAX_CHARS,
} from "../../src/lib/ipc/bindings.ts";
import {
  CommandFailure,
  emitFakeEvent,
  type FakeBackend,
} from "./fake-backend.ts";
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
import { sampleSeries, type WireSeries } from "./series-catalog.ts";

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
      language: null,
      hasDownloads: false,
      isAdult: false,
      continuesFrom: null,
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

function found(
  search: LibrarySearch,
  catalog: readonly FakeSeries[] = CATALOG,
): WireSeries[] {
  const words = search.text.toLowerCase().split(/\s+/).filter(Boolean);
  const meets = (inclusion: string, holds: boolean) =>
    inclusion === "any" || holds === (inclusion === "only");
  return catalog
    .filter(
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

  for (const name of ["Clear", "Remove the Unread filter"]) {
    const action = page.getByRole("button", { name, exact: true });
    await action.hover();
    await expect(action).toHaveAccessibleDescription(name);
    await expect(action).not.toHaveAttribute("title");
  }
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
  await expect(page).toHaveURL(
    /\/series\/0190a3e4-0000-8000-8000-000000000002$/,
  );
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

/** Sends `key` the way an input method does while it composes, flagged as composing, or with the 229 key code some engines give instead. */
async function composingKey(
  field: Locator,
  key: string,
  flag: "isComposing" | "keyCode 229",
): Promise<void> {
  await field.evaluate(
    (element, [pressed, marker]) => {
      const event = new KeyboardEvent("keydown", {
        key: pressed,
        bubbles: true,
        cancelable: true,
        isComposing: marker === "isComposing",
      });
      if (marker === "keyCode 229") {
        Object.defineProperty(event, "keyCode", { value: 229 });
      }
      element.dispatchEvent(event);
    },
    [key, flag] as const,
  );
}

for (const flag of ["isComposing", "keyCode 229"] as const) {
  test(`leaves the keys of an input method's composition to it, flagged by ${flag}`, async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktop only");
    await page.goto("/search");
    await searchField(page).fill("a");
    await expect(results(page).getByRole("option")).toHaveCount(4);
    await searchField(page).press("ArrowDown");
    const active = await searchField(page).getAttribute(
      "aria-activedescendant",
    );

    for (const key of ["ArrowRight", "ArrowDown", "Enter", "Escape"]) {
      await composingKey(searchField(page), key, flag);
    }

    await expect(page).toHaveURL(/\/search$/);
    await expect(searchField(page)).toHaveAttribute(
      "aria-activedescendant",
      active ?? "",
    );
  });
}

test("leaves Shift, Control, Alt and Meta with the arrow keys and Home to the field", async ({
  page,
}) => {
  test.skip(!isDesktop(page), "desktop only");
  await page.goto("/search");
  await searchField(page).fill("ar");
  await expect(results(page).getByRole("option")).toHaveCount(3);
  await searchField(page).press("ArrowDown");
  const active = await searchField(page).getAttribute("aria-activedescendant");

  await searchField(page).press("Shift+Home");
  const selected = await searchField(page).evaluate(
    (field: HTMLInputElement) => [field.selectionStart, field.selectionEnd],
  );
  for (const key of ["Control+ArrowRight", "Alt+ArrowDown", "Meta+ArrowLeft"]) {
    await searchField(page).press(key);
  }

  expect(selected).toEqual([0, 2]);
  await expect(searchField(page)).toHaveAttribute(
    "aria-activedescendant",
    active ?? "",
  );
});

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

test.describe("as the library changes under a search", () => {
  let shelf: readonly FakeSeries[] = CATALOG;

  test.use({
    backend: {
      ...SEARCHING_BACKEND,
      librarySearch: (_after, search) => ({
        series: found(search, shelf),
        next: null,
      }),
      librarySearchCount: (search) => found(search, shelf).length,
    },
  });

  test.beforeEach(() => {
    shelf = CATALOG;
  });

  test("keeps the highlight on the series it was on", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    await page.goto("/search");
    await searchField(page).fill("market");
    await expectFound(page, ["Lantern Market", "Market Lanterns"]);
    await searchField(page).press("ArrowDown");

    shelf = [
      fakeSeries(5, "Alpha Market", { unread: 1, isStarted: false }),
      ...CATALOG,
    ];
    await emitFakeEvent(page, "library-changed");

    await expectFound(page, [
      "Alpha Market",
      "Lantern Market",
      "Market Lanterns",
    ]);
    await expect(
      results(page).getByRole("option", { selected: true }),
    ).toContainText("Lantern Market");
  });
});

test.describe("while a search is still out", () => {
  const HELD_TEXT = "harbour";
  let release: () => void = () => undefined;
  let held: Promise<void> = Promise.resolve();
  let searches: string[] = [];

  test.use({
    backend: {
      ...SEARCHING_BACKEND,
      librarySearch: async (_after, search) => {
        searches.push(search.text);
        if (search.text === HELD_TEXT) {
          await held;
        }
        return { series: found(search), next: null };
      },
    },
  });

  test.beforeEach(() => {
    searches = [];
    held = new Promise((resolve) => {
      release = resolve;
    });
  });

  test("moves through and opens none of the results the search before found", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktop only");
    await page.goto("/search");
    await searchField(page).fill("market");
    await expectFound(page, ["Lantern Market", "Market Lanterns"]);

    await searchField(page).fill(HELD_TEXT);
    await searchField(page).press("ArrowDown");
    await searchField(page).press("Enter");

    await expect(searchField(page)).not.toHaveAttribute(
      "aria-activedescendant",
    );
    expect(new URL(page.url()).search).toBe("");
    release();
    await expectFound(page, ["Harbour Gate"]);
    await expect(page).toHaveURL(/\/search$/);
  });

  test("opens none of the results the search before found when one is pressed", async ({
    page,
  }) => {
    await page.goto("/search");
    await searchField(page).fill("market");
    await expectFound(page, ["Lantern Market", "Market Lanterns"]);

    await searchField(page).fill(HELD_TEXT);
    await results(page).getByRole("option").first().click();
    release();

    await expectFound(page, ["Harbour Gate"]);
    await expect(page).toHaveURL(/\/search$/);
  });

  test("says nothing is called the text only once its search answers", async ({
    page,
  }) => {
    await page.goto("/search");
    await searchField(page).fill("zzz");
    await expect(
      page.getByRole("heading", { name: "Nothing called “zzz”" }),
    ).toBeVisible();

    await searchField(page).fill(HELD_TEXT);

    await expect(page.getByRole("main")).not.toContainText(
      `Nothing called “${HELD_TEXT}”`,
    );
    release();
    await expectFound(page, ["Harbour Gate"]);
  });

  test("searches again for nothing but a space typed after the words", async ({
    page,
  }) => {
    await page.goto("/search");
    await searchField(page).fill("market");
    await expectFound(page, ["Lantern Market", "Market Lanterns"]);

    await searchField(page).press("End");
    await searchField(page).pressSequentially("  ");
    await expect(searchField(page)).toHaveValue("market  ");
    await expectFound(page, ["Lantern Market", "Market Lanterns"]);

    expect(searches).toEqual(["market"]);
  });
});

test.describe("the search page's one status", () => {
  const FAILING_TEXT = "boom";

  test.use({
    backend: {
      ...SEARCHING_BACKEND,
      librarySearch: (_after, search) => {
        if (search.text === FAILING_TEXT) {
          throw new CommandFailure({
            code: "internal",
            message: "the search failed",
          });
        }
        return { series: found(search), next: null };
      },
    },
  });

  test("announces what was found, that nothing was, and a failure, from the same place", async ({
    page,
  }) => {
    await page.goto("/search");
    const status = page.getByRole("main").getByRole("status");
    await expect(status).toHaveCount(1);
    await status.evaluate((element) => {
      element.dataset.first = "yes";
    });

    await searchField(page).fill("market");
    await expect(status).toHaveText("2 series found");
    await searchField(page).fill("zzz");
    await expect(status).toHaveText("Nothing called “zzz”");
    await searchField(page).fill(FAILING_TEXT);
    await expect(status).toHaveText("Couldn't search your library. Try again.");

    await expect(status).toHaveAttribute("data-first", "yes");
  });
});

test.describe("a long list of results", () => {
  const LONG_LIST = sampleSeries(300);

  test.use({
    backend: {
      ...SEARCHING_BACKEND,
      librarySearch: () => ({ series: LONG_LIST, next: null }),
      librarySearchCount: () => LONG_LIST.length,
    },
  });

  /** The option the field names active, which must be drawn and in view for a screen reader and a sighted person alike. */
  async function activeOption(page: Page): Promise<Locator> {
    await expect(searchField(page)).toHaveAttribute("aria-activedescendant");
    const id = await searchField(page).getAttribute("aria-activedescendant");
    const option = page.locator(`[id="${id ?? ""}"]`);
    await expect(option).toBeInViewport();
    return option;
  }

  test("reveals the result End, Home and the arrows move to beyond the rows drawn", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktop only");
    await page.goto("/search");
    await searchField(page).fill("sample");
    await expect(results(page).getByRole("option").first()).toBeVisible();

    await searchField(page).press("ArrowDown");
    await searchField(page).press("End");
    await expect(await activeOption(page)).toContainText(
      LONG_LIST.at(-1)?.title ?? "",
    );
    await searchField(page).press("Home");
    await expect(await activeOption(page)).toContainText(
      LONG_LIST[0]?.title ?? "",
    );
    for (let row = 0; row < 20; row += 1) {
      await searchField(page).press("ArrowDown");
    }
    await expect(await activeOption(page)).toContainText(
      LONG_LIST[60]?.title ?? "",
    );
  });
});
