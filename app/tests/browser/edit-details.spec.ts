import type { Locator, Page } from "@playwright/test";

import type { SeriesDetails } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

type WireEdits = Parameters<FakeBackend["editSeriesDetails"]>[1];

const FILE_TITLE = SERIES_TITLE;
const TYPED_TITLE = "The Harbour Gate";
const FROM_FILES = {
  title: { fromFile: FILE_TITLE, edited: null },
  people: {
    fromFile: [
      { name: "Author A", role: "story" },
      { name: "Author C", role: "art" },
    ],
    edited: null,
  },
  tags: { fromFile: ["Seinen", "Sea"], edited: null },
  summary: {
    fromFile:
      "A lighthouse keeper’s apprentice spends every winter writing letters to a sister across the northern sea.",
    edited: null,
  },
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;

const LISTED_SERIES = {
  id: SERIES_ID,
  title: SERIES_TITLE,
  bookCount: 3,
  unreadCount: 3,
  cover: null,
  language: null,
  hasDownloads: false,
  isAdult: false,
  continuesFrom: null,
};

let details: SeriesDetails = FROM_FILES;
let sent: WireEdits[] = [];
let shelf = new FakeShelf([
  { state: "notStarted" },
  { state: "notStarted" },
  { state: "notStarted" },
]);

const EDITING_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: () => ({ series: [LISTED_SERIES], next: null }),
  librarySeriesCount: () => 1,
  seriesLabels: () => ({
    keepsLabels: true,
    categories: [],
    tags: [],
    suggestedTags: [],
  }),
  seriesOverview: (id) => shelf.backend().seriesOverview(id),
  seriesBooks: (id, listing, after) =>
    shelf.backend().seriesBooks(id, listing, after),
  keepsDetailEdits: () => true,
  seriesDetails: () => details,
  editSeriesDetails: (_, edits) => {
    sent = [...sent, edits];
    return null;
  },
};

test.use({ backend: EDITING_BACKEND });

test.beforeEach(() => {
  details = FROM_FILES;
  sent = [];
  shelf = new FakeShelf([
    { state: "notStarted" },
    { state: "notStarted" },
    { state: "notStarted" },
  ]);
});

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

function editor(page: Page): Locator {
  return isWide(page)
    ? page.getByRole("dialog", { name: "Edit details" })
    : page.getByRole("main");
}

function discardConfirm(page: Page): Locator {
  return page.getByRole("alertdialog", { name: "Discard your changes?" });
}

function seriesMenuButton(page: Page): Locator {
  return page.getByRole("button", {
    name: `More for ${SERIES_TITLE}`,
    exact: true,
  });
}

async function openEditor(page: Page): Promise<Locator> {
  if (isWide(page)) {
    await page.goto(`/series/${SERIES_ID}`);
    await page
      .getByRole("region", { name: "Details" })
      .getByRole("button", { name: "Edit details" })
      .click();
  } else {
    await page.goto(`/series/${SERIES_ID}`);
    await seriesMenuButton(page).click();
    await page.getByRole("menuitem", { name: "Edit details…" }).click();
  }
  const shown = editor(page);
  await expect(shown.getByRole("textbox", { name: "Title" })).toBeVisible();
  return shown;
}

async function leave(page: Page, shown: Locator): Promise<void> {
  await shown
    .getByRole("button", { name: isWide(page) ? "Cancel" : "Close" })
    .click();
}

async function save(shown: Locator): Promise<void> {
  await shown.getByRole("button", { name: "Save" }).click();
}

test("shows each detail with what the file says under it", async ({ page }) => {
  const shown = await openEditor(page);

  await expect(shown.getByRole("textbox", { name: "Title" })).toHaveValue(
    FILE_TITLE,
  );
  await expect(
    shown.getByRole("textbox", { name: "Title" }),
  ).toHaveAccessibleDescription("The file’s title");
  await expect(
    shown.getByRole("group", { name: "People" }).getByRole("button"),
  ).toHaveText(["Story · Author A", "Art · Author C", "Add a person"]);
  await expect(
    shown.getByRole("button", { name: "Remove Author A as story" }),
  ).toBeVisible();
  await expect(
    shown.getByRole("group", { name: "Tags" }).getByRole("button"),
  ).toHaveText(["Seinen", "Sea", "Add a tag"]);
  await expect(
    shown.getByRole("switch", { name: "Mark as 18+" }),
  ).toHaveAccessibleDescription(
    "The file has no age rating. Marked series follow Settings › Library › 18+ content.",
  );
  await expect(shown.getByText("Edited")).toHaveCount(0);
});

test("says an edited title is edited and saves it over the file's", async ({
  page,
}) => {
  const shown = await openEditor(page);

  await shown.getByRole("textbox", { name: "Title" }).fill(TYPED_TITLE);
  await expect(shown.getByText("Edited")).toBeVisible();
  await expect(
    shown.getByRole("textbox", { name: "Title" }),
  ).toHaveAccessibleDescription(`From the file: “${FILE_TITLE}”`);
  await save(shown);

  await expect(page.getByRole("dialog")).toHaveCount(0);
  if (!isWide(page)) {
    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`, "u"));
  }
  expect(sent).toEqual([
    {
      title: TYPED_TITLE,
      people: null,
      tags: null,
      summary: null,
      isMarkedAdult: false,
    },
  ]);
});

test("says the details are saved, and Undo puts back what they were", async ({
  page,
}) => {
  details = {
    ...FROM_FILES,
    tags: { fromFile: FROM_FILES.tags.fromFile, edited: ["Seinen"] },
  };
  const shown = await openEditor(page);
  await shown.getByRole("textbox", { name: "Title" }).fill(TYPED_TITLE);
  await save(shown);

  await expect(page.getByText("Details saved")).toBeVisible();
  await expect(
    page.getByText("Your changes show only in Omnileaf", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();

  await expect
    .poll(() => sent.at(-1))
    .toEqual({
      title: null,
      people: null,
      tags: ["Seinen"],
      summary: null,
      isMarkedAdult: false,
    });
});

test("puts the title back to the file's, with Undo", async ({ page }) => {
  details = {
    ...FROM_FILES,
    title: { fromFile: FILE_TITLE, edited: TYPED_TITLE },
  };
  const shown = await openEditor(page);
  const title = shown.getByRole("textbox", { name: "Title" });

  await shown.getByRole("button", { name: "Use the file’s title" }).click();
  await expect(title).toHaveValue(FILE_TITLE);
  await expect(page.getByText("Title back to the file’s")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();

  await expect(title).toHaveValue(TYPED_TITLE);
  await expect(discardConfirm(page)).toHaveCount(0);
});

test("takes a tag off, adds one, and saves the tags over the file's", async ({
  page,
}) => {
  const shown = await openEditor(page);
  const tags = shown.getByRole("group", { name: "Tags" });

  await tags.getByRole("button", { name: "Remove Sea" }).click();
  await tags.getByRole("button", { name: "Add a tag" }).click();
  await tags.getByRole("textbox", { name: "Add a tag" }).fill("Slice of life");
  await tags.getByRole("textbox", { name: "Add a tag" }).press("Enter");
  await expect(
    shown.getByRole("button", { name: "Use the file’s tags" }),
  ).toBeVisible();
  await expect(shown.getByText("From the file: Seinen, Sea")).toBeVisible();
  await save(shown);

  await expect
    .poll(() => sent.map(({ tags: kept }) => kept))
    .toEqual([["Seinen", "Slice of life"]]);
});

test("asks before leaving with unsaved changes, and Keep editing stays", async ({
  page,
}) => {
  const shown = await openEditor(page);
  await shown.getByRole("textbox", { name: "Title" }).fill(TYPED_TITLE);
  await shown
    .getByRole("group", { name: "Tags" })
    .getByRole("button", { name: "Remove Sea" })
    .click();

  await leave(page, shown);
  await expect(discardConfirm(page)).toContainText("Title and tags changed");
  await expect(discardConfirm(page)).toContainText(
    "The details stay as they were before you opened Edit details.",
  );
  await discardConfirm(page)
    .getByRole("button", { name: "Keep editing" })
    .click();

  await expect(discardConfirm(page)).toHaveCount(0);
  await expect(shown.getByRole("textbox", { name: "Title" })).toHaveValue(
    TYPED_TITLE,
  );
});

test("Discard leaves without saving", async ({ page }) => {
  const shown = await openEditor(page);
  await shown.getByRole("textbox", { name: "Title" }).fill(TYPED_TITLE);

  await leave(page, shown);
  await discardConfirm(page).getByRole("button", { name: "Discard" }).click();

  await expect(discardConfirm(page)).toHaveCount(0);
  if (isWide(page)) {
    await expect(editor(page)).toHaveCount(0);
  } else {
    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`, "u"));
  }
  expect(sent).toEqual([]);
});

test("leaves at once with nothing changed", async ({ page }) => {
  const shown = await openEditor(page);

  await leave(page, shown);

  await expect(discardConfirm(page)).toHaveCount(0);
  if (isWide(page)) {
    await expect(editor(page)).toHaveCount(0);
  } else {
    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`, "u"));
  }
});

test("shows the first eight people, then Show all", async ({ page }) => {
  details = {
    ...FROM_FILES,
    people: {
      fromFile: Array.from({ length: 12 }, (_, index) => ({
        name: `Author ${String(index + 1)}`,
        role: "story",
      })),
      edited: null,
    },
  };
  const shown = await openEditor(page);
  const people = shown.getByRole("group", { name: "People" });

  await expect(people.getByRole("button", { name: /^Remove/u })).toHaveCount(8);
  await people.getByRole("button", { name: "Show all 12" }).click();

  await expect(people.getByRole("button", { name: /^Remove/u })).toHaveCount(
    12,
  );
});

test("names the series in the dialog on desktop", async ({ page }) => {
  test.skip(!isWide(page), "a phone opens Edit details as a page");
  const shown = await openEditor(page);

  await expect(shown).toHaveAccessibleDescription(
    `${SERIES_TITLE} · your changes show only in Omnileaf`,
  );
});

test("offers Edit details… in the cover menu after Categories and tags…", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a pointer right-clicks");
  await page.goto("/");
  await page
    .getByRole("list", { name: "Series" })
    .getByRole("link")
    .first()
    .click({ button: "right" });

  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
    "Open series",
    "Mark as read",
    "Categories and tags…",
    "Edit details…",
    "Select",
    "Show in folder",
  ]);
  await page.getByRole("menuitem", { name: "Edit details…" }).click();

  await expect(
    page
      .getByRole("dialog", { name: "Edit details" })
      .getByRole("textbox", { name: "Title" }),
  ).toHaveValue(FILE_TITLE);
});

test("offers Edit details… in the series page's ⋯ menu, after Categories and tags…", async ({
  page,
}) => {
  test.skip(isWide(page), "a wide desktop page has no series bar");
  await page.goto(`/series/${SERIES_ID}`);
  await seriesMenuButton(page).click();

  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
    /Mark every book read/u,
    /Mark every book unread/u,
    /Categories and tags…/u,
    /Edit details…/u,
    /Show in folder/u,
  ]);
  await page.getByRole("menuitem", { name: "Categories and tags…" }).click();

  await expect(
    page.getByRole("dialog", { name: "Categories and tags" }),
  ).toBeVisible();
});

test.describe("on Android", () => {
  test.use({
    backend: {
      ...EDITING_BACKEND,
      appInfo: onPlatform("android").backend.appInfo,
    },
  });

  test("names Show the folder in the ⋯ menu, coming soon", async ({ page }) => {
    test.skip(isWide(page), "a wide page has no series bar");
    await page.goto(`/series/${SERIES_ID}`);
    await seriesMenuButton(page).click();

    await expect(
      page.getByRole("menuitem", { name: "Show the folder · coming soon" }),
    ).toBeDisabled();
  });
});

test("has no accessibility violations", async ({ page }) => {
  await openEditor(page);

  expect(await accessibilityViolations(page)).toEqual([]);
});

test.describe("while the library keeps no edits", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: () => ({ series: [LISTED_SERIES], next: null }),
      librarySeriesCount: () => 1,
      seriesOverview: (id) => shelf.backend().seriesOverview(id),
      seriesBooks: (id, listing, after) =>
        shelf.backend().seriesBooks(id, listing, after),
    } satisfies FakeBackend,
  });

  test("leaves Edit details out of the cover menu", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a pointer right-clicks");
    await page.goto("/");
    await page
      .getByRole("list", { name: "Series" })
      .getByRole("link")
      .first()
      .click({ button: "right" });

    await expect(page.getByRole("menu")).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Edit details…" }),
    ).toHaveCount(0);
  });
});
