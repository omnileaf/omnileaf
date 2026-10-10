import type { Locator, Page } from "@playwright/test";

import {
  type LibraryFilter,
  type LibrarySearch,
  SEARCH_MAX_CHARS,
} from "../../src/lib/ipc/bindings.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  LARGE_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries, type WireSeries } from "./series-catalog.ts";

const FILTER_WORD_TITLE = "Finished Business";
const LENGTHY_TITLE = `The Lengthy Tale ${"of Many Volumes ".repeat(14)}`;

function seriesTitled(number: number, title: string): WireSeries {
  return {
    id: `0190a3e4-0000-8000-8000-${String(number).padStart(12, "0")}`,
    title,
    bookCount: 1,
    unreadCount: 1,
    cover: null,
  };
}

const CATALOG: readonly WireSeries[] = [
  ...sampleSeries(12),
  seriesTitled(13, FILTER_WORD_TITLE),
  seriesTitled(14, LENGTHY_TITLE),
];
const SERIES_SHOWN = 6;
const PLACES_HOLDING_SE = 8;

/** Every series here is unread and unstarted, so only a filter letting those through finds any. */
function letsThrough(filter: LibraryFilter): boolean {
  return (
    filter.unread !== "hide" &&
    filter.started !== "only" &&
    filter.finished !== "only"
  );
}

function found(search: LibrarySearch): WireSeries[] {
  if (Array.from(search.text).length > SEARCH_MAX_CHARS) {
    throw new CommandFailure({
      code: "searchTooLong",
      message: "the search is longer than a search reads",
    });
  }
  const text = search.text.trim().toLowerCase();
  return CATALOG.filter(
    (series) =>
      letsThrough(search.filter) && series.title.toLowerCase().includes(text),
  );
}

const SEARCHING_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: () => ({ series: [...CATALOG], next: null }),
  librarySearch: (_after, search) => ({ series: found(search), next: null }),
  librarySearchCount: (search) => found(search).length,
};

test.use({ backend: SEARCHING_BACKEND });

test.beforeEach(({ page }) => {
  test.skip(viewportOf(page).width < LARGE_MIN_WIDTH, "desktop only");
});

function quickOpen(page: Page): Locator {
  return page.getByRole("dialog", { name: "Quick open" });
}

function field(page: Page): Locator {
  return quickOpen(page).getByRole("combobox", {
    name: "Search or go to a page",
  });
}

function searchField(page: Page): Locator {
  return page.getByRole("combobox", { name: "Search your library" });
}

function seriesFound(page: Page): Locator {
  return page
    .getByRole("listbox", { name: "Series found" })
    .getByRole("option");
}

function options(page: Page): Locator {
  return quickOpen(page).getByRole("option");
}

function selected(page: Page): Locator {
  return quickOpen(page).getByRole("option", { selected: true });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("main").getByRole("listitem").first(),
  ).toBeVisible();
}

async function pressQuickOpen(page: Page): Promise<void> {
  await page.keyboard.press("Control+k");
  await expect(field(page)).toBeFocused();
}

test("opens with Control K from anywhere, offering every page", async ({
  page,
}) => {
  await page.goto("/settings/appearance");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await pressQuickOpen(page);

  await expect(
    quickOpen(page).getByRole("group", { name: "Go to" }).getByRole("option"),
  ).toHaveCount(10);
  await expect(selected(page)).toContainText("Library");
});

test("finds series and pages by what is typed", async ({ page }) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("se");

  const series = quickOpen(page).getByRole("group", { name: "Series" });
  await expect(series.getByRole("option")).toHaveCount(SERIES_SHOWN);
  await expect(series.getByRole("option").first()).toContainText(
    "Sample Series 0001",
  );
  await expect(
    quickOpen(page).getByRole("group", { name: "Go to" }).getByRole("option"),
  ).toHaveText([
    /Browse/,
    /^\s*Settings\s*$/,
    /Library/,
    /Appearance/,
    /Privacy/,
    /General/,
    /Advanced/,
    /About/,
  ]);
});

test("moves through the choices with the arrow keys and jumps groups with Tab", async ({
  page,
}) => {
  await openLibrary(page);
  await pressQuickOpen(page);
  await field(page).fill("se");
  await expect(options(page)).toHaveCount(SERIES_SHOWN + PLACES_HOLDING_SE);

  await field(page).press("ArrowDown");
  const second = await selected(page).innerText();
  await field(page).press("Tab");
  const firstPlace = await selected(page).innerText();
  await field(page).press("ArrowUp");
  const lastSeries = await selected(page).innerText();

  expect([second, firstPlace, lastSeries]).toEqual([
    expect.stringContaining("Sample Series 0002"),
    expect.stringContaining("Browse"),
    expect.stringContaining("Sample Series 0006"),
  ]);
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute(
    "aria-activedescendant",
    (await selected(page).getAttribute("id")) ?? "",
  );
});

test("goes to the page chosen with Enter", async ({ page }) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("appear");
  await field(page).press("Enter");

  await expect(quickOpen(page)).toBeHidden();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Appearance" }),
  ).toBeFocused();
});

for (const flag of ["isComposing", "keyCode 229"] as const) {
  test(`leaves the keys of an input method's composition to it, flagged by ${flag}`, async ({
    page,
  }) => {
    await openLibrary(page);
    await pressQuickOpen(page);
    await field(page).fill("se");
    await expect(options(page)).toHaveCount(SERIES_SHOWN + PLACES_HOLDING_SE);
    const before = await selected(page).textContent();

    const kept = await field(page).evaluate((element, marker) => {
      const send = (key: string): boolean => {
        const event = new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          isComposing: marker === "isComposing",
        });
        if (marker === "keyCode 229") {
          Object.defineProperty(event, "keyCode", { value: 229 });
        }
        return element.dispatchEvent(event);
      };
      const keys = ["ArrowDown", "Tab", "Enter", "Escape"].map(send);
      const dialog = element.closest("dialog");
      const cancel = new Event("cancel", { cancelable: true });
      const closes = dialog?.dispatchEvent(cancel) ?? true;
      return { keys, closes };
    }, flag);

    expect(kept).toEqual({ keys: [true, true, true, true], closes: false });
    await expect(quickOpen(page)).toBeVisible();
    await expect(selected(page)).toHaveText(before ?? "");
  });
}

test("shows the series chosen on the search page", async ({ page }) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("0007");
  await options(page).first().click();

  await expect(page).toHaveURL(/\/search\?title=Sample\+Series\+0007$/);
  await expect(
    page.getByRole("listbox", { name: "Series found" }).getByRole("option"),
  ).toHaveText([/Sample Series 0007/]);
});

test("fills the search field with a series' stand-in, never its title, while Screenshot mode is on", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "omnileaf.screenshotMode",
      JSON.stringify({ activity: { kind: "on" } }),
    );
  });
  await openLibrary(page);
  await pressQuickOpen(page);
  await field(page).fill("0007");

  await options(page).first().click();

  await expect(
    page.getByRole("combobox", { name: "Search your library" }),
  ).toHaveValue(/^Series \d{2,3}$/);
  expect(page.url()).not.toContain("Sample");
});

test("shows another series chosen while the search page is open", async ({
  page,
}) => {
  await page.goto("/search?q=Sample+Series+0007");
  await expect(
    page.getByRole("listbox", { name: "Series found" }).getByRole("option"),
  ).toHaveText([/Sample Series 0007/]);
  await pressQuickOpen(page);

  await field(page).fill("0008");
  await field(page).press("Enter");

  await expect(
    page.getByRole("combobox", { name: "Search your library" }),
  ).toHaveValue("Sample Series 0008");
  await expect(
    page.getByRole("listbox", { name: "Series found" }).getByRole("option"),
  ).toHaveText([/Sample Series 0008/]);
});

test("takes no more text than a search reads", async ({ page }) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("s".repeat(SEARCH_MAX_CHARS + 1));

  await expect(field(page)).toHaveValue("s".repeat(SEARCH_MAX_CHARS));
});

test("shows a chosen series whose title holds a filter word as it is", async ({
  page,
}) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("business");
  await field(page).press("Enter");

  await expect(searchField(page)).toHaveValue(FILTER_WORD_TITLE);
  await expect(seriesFound(page)).toHaveText([new RegExp(FILTER_WORD_TITLE)]);
});

test("shows a chosen series whose title is longer than a search reads", async ({
  page,
}) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("lengthy");
  await field(page).press("Enter");

  await expect(searchField(page)).toHaveValue(
    Array.from(LENGTHY_TITLE).slice(0, SEARCH_MAX_CHARS).join(""),
  );
  await expect(seriesFound(page)).toHaveText([/The Lengthy Tale/]);
});

test("shows the series chosen again after something else was typed on the search page", async ({
  page,
}) => {
  await openLibrary(page);
  await pressQuickOpen(page);
  await field(page).fill("0007");
  await field(page).press("Enter");
  await expect(seriesFound(page)).toHaveText([/Sample Series 0007/]);
  await searchField(page).fill("zzz");
  await pressQuickOpen(page);

  await field(page).fill("0007");
  await field(page).press("Enter");

  await expect(searchField(page)).toHaveValue("Sample Series 0007");
  await expect(seriesFound(page)).toHaveText([/Sample Series 0007/]);
});

test("tells whoever is in the field when nothing is called what was typed", async ({
  page,
}) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("zzz");

  await expect(field(page)).toHaveAccessibleDescription("Nothing called “zzz”");
  await expect(quickOpen(page).getByRole("status")).toHaveText(
    "Nothing called “zzz”",
  );
});

test("closes with Escape and gives focus back to where it was", async ({
  page,
}) => {
  await openLibrary(page);
  const filter = page
    .locator("main header")
    .getByRole("button", { name: /^Filter and sort/ });
  await filter.focus();
  await pressQuickOpen(page);

  await page.keyboard.press("Escape");

  await expect(quickOpen(page)).toBeHidden();
  await expect(filter).toBeFocused();
});

test.describe("on macOS", () => {
  test.use(onPlatform("macos"));

  test("opens with Command K and says so", async ({ page }) => {
    await page.goto("/history");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.keyboard.press("Meta+k");

    await expect(field(page)).toBeFocused();
    await expect(quickOpen(page).getByText("⌘ K from anywhere")).toBeVisible();
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`quick open finding nothing has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openLibrary(page);
    await pressQuickOpen(page);
    await field(page).fill("zzz");
    await expect(
      quickOpen(page).getByText("Nothing called “zzz”"),
    ).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });

  test(`quick open has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openLibrary(page);
    await pressQuickOpen(page);
    await field(page).fill("se");
    await expect(options(page)).toHaveCount(SERIES_SHOWN + PLACES_HOLDING_SE);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test.describe("while a search is still out", () => {
  const HELD_TEXT = "sample";
  let release: () => void = () => undefined;
  let held: Promise<void> = Promise.resolve();

  test.use({
    backend: {
      ...SEARCHING_BACKEND,
      librarySearch: async (_after, search) => {
        if (search.text === HELD_TEXT) {
          await held;
        }
        return { series: found(search), next: null };
      },
    },
  });

  test.beforeEach(() => {
    held = new Promise((resolve) => {
      release = resolve;
    });
  });

  test("opens nothing from the search before when Enter is pressed", async ({
    page,
  }) => {
    await openLibrary(page);
    await pressQuickOpen(page);
    await field(page).fill("0001");
    await expect(selected(page)).toContainText("Sample Series 0001");

    await field(page).fill(HELD_TEXT);
    await field(page).press("Enter");

    await expect(quickOpen(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    release();
    await expect(options(page)).toHaveCount(SERIES_SHOWN);
  });

  test("starts again from the first choice once the search answers", async ({
    page,
  }) => {
    await openLibrary(page);
    await pressQuickOpen(page);
    await field(page).fill("se");
    await expect(options(page)).toHaveCount(SERIES_SHOWN + PLACES_HOLDING_SE);

    await field(page).fill(HELD_TEXT);
    for (let step = 0; step < 3; step += 1) {
      await field(page).press("ArrowDown");
    }
    release();

    await expect(options(page).first()).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("says nothing is called the text only once its search answers", async ({
    page,
  }) => {
    await openLibrary(page);
    await pressQuickOpen(page);
    await field(page).fill("zzz");
    await expect(quickOpen(page).getByRole("status")).toHaveText(
      "Nothing called “zzz”",
    );

    await field(page).fill(HELD_TEXT);

    await expect(quickOpen(page).getByRole("status")).toHaveText("");
    release();
    await expect(options(page)).toHaveCount(SERIES_SHOWN);
  });
});
