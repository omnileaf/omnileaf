import type { Locator, Page } from "@playwright/test";

import type { Platform, SeriesDetails } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  onPlatform,
  settle,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

type WireEdits = Parameters<FakeBackend["editSeriesDetails"]>[1];

const FILE_TITLE = SERIES_TITLE;
const TYPED_TITLE = "The Harbour Gate";
const FROM_FILES = {
  title: { fromFile: FILE_TITLE, source: "folderName", edited: null },
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
  year: null,
  language: null,
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

function editor(page: Page, platform?: Platform): Locator {
  return isWide(page) || platform === "ios"
    ? page.getByRole("dialog", { name: "Edit details" })
    : page.getByRole("main");
}

function discardConfirm(page: Page): Locator {
  return page.getByRole("alertdialog", { name: "Discard your changes?" });
}

async function tap(target: Locator): Promise<void> {
  const touch = { pointerType: "touch", pointerId: 7, isPrimary: true };
  await target.dispatchEvent("pointerdown", touch);
  await target.dispatchEvent("pointerup", touch);
  await target.dispatchEvent("click");
}

async function lengthOf(page: Page, token: `--${string}`): Promise<number> {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.blockSize = `var(${name})`;
    probe.style.position = "absolute";
    document.body.append(probe);
    const length = probe.getBoundingClientRect().height;
    probe.remove();
    return length;
  }, token);
}

function seriesMenuButton(page: Page): Locator {
  return page.getByRole("button", {
    name: `More for ${SERIES_TITLE}`,
    exact: true,
  });
}

async function askForEditor(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  if (isWide(page)) {
    await page
      .getByRole("region", { name: "Details" })
      .getByRole("button", { name: "Edit details" })
      .click();
  } else {
    await seriesMenuButton(page).click();
    await page.getByRole("menuitem", { name: "Edit details…" }).click();
  }
}

async function openEditor(page: Page, platform?: Platform): Promise<Locator> {
  await askForEditor(page);
  const shown = editor(page, platform);
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
    shown.getByRole("button", { name: "Remove Story · Author A" }),
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
    title: { fromFile: FILE_TITLE, source: "folderName", edited: TYPED_TITLE },
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

test("lets an emptied title fall back to the file's, greyed in the field", async ({
  page,
}) => {
  details = {
    ...FROM_FILES,
    title: { fromFile: FILE_TITLE, source: "folderName", edited: TYPED_TITLE },
  };
  const shown = await openEditor(page);
  const title = shown.getByRole("textbox", { name: "Title" });

  await title.fill("");

  await expect(title).toHaveAttribute("placeholder", FILE_TITLE);
  await expect(title).toHaveAccessibleDescription(
    `Left empty, so the file’s title shows: “${FILE_TITLE}”. Type to set your own.`,
  );
  await expect(shown.getByText("Edited")).toHaveCount(0);
  await save(shown);

  await expect.poll(() => sent.map(({ title: kept }) => kept)).toEqual([null]);
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

test.describe("a file rated 18+", () => {
  test.beforeEach(() => {
    details = { ...FROM_FILES, isRatedAdult: true };
  });

  test("keeps the 18+ mark on and locked, and links to Settings > Library", async ({
    page,
  }) => {
    const shown = await openEditor(page);
    const mark = shown.getByRole("switch", { name: "Mark as 18+" });

    await expect(mark).toBeChecked();
    await expect(mark).toBeDisabled();
    await expect(mark).toHaveAccessibleDescription(
      "Rated 18+ in the file. To change that, turn off Use age ratings from book details in Settings › Library.",
    );
    await expect(
      shown.getByRole("link", { name: "Settings › Library" }),
    ).toHaveAttribute("href", "/settings/library/adult-content");
  });

  test.describe("while age ratings are off", () => {
    test.use({
      backend: {
        ...EDITING_BACKEND,
        libraryAdultContent: () => ({
          treatment: "show",
          countsAgeRatings: false,
        }),
      },
    });

    test("lets the 18+ mark alone decide", async ({ page }) => {
      const shown = await openEditor(page);
      const mark = shown.getByRole("switch", { name: "Mark as 18+" });

      await expect(mark).not.toBeChecked();
      await expect(mark).toBeEnabled();
      await expect(mark).toHaveAccessibleDescription(
        "The file rates it Adults Only 18+, but Use age ratings from book details is off in Settings › Library, so only this switch counts.",
      );
      await mark.click();
      await save(shown);

      await expect
        .poll(() => sent.map(({ isMarkedAdult }) => isMarkedAdult))
        .toEqual([true]);
    });
  });
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

test.describe("the 18+ mark on a phone", { tag: "@native" }, () => {
  test("toggles from its switch alone on an iPhone, and from the whole row on android", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    const shown = await openEditor(page, platform);
    const mark = shown.getByRole("switch", { name: "Mark as 18+" });

    if (platform === "ios") {
      await settle(shown);
      await tap(shown.getByText("Mark as 18+", { exact: true }));
      await expect(mark).not.toBeChecked();
      await tap(mark);
    } else {
      await shown.getByText("Mark as 18+", { exact: true }).click();
    }
    await expect(mark).toBeChecked();
  });

  test("fills the card's whole width when its row is pressed on android", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "android", "an iPhone row draws no pressed fill");
    const shown = await openEditor(page, platform);
    const row = shown.getByRole("switch", { name: "Mark as 18+" });

    const edges = await row.evaluate((element) => {
      const card = element.closest("section");
      const own = element.getBoundingClientRect();
      const around = card?.getBoundingClientRect();
      return {
        start: own.left - (around?.left ?? Number.NaN),
        end: (around?.right ?? Number.NaN) - own.right,
        bottom: (around?.bottom ?? Number.NaN) - own.bottom,
      };
    });

    expect(edges.start).toBeLessThanOrEqual(1);
    expect(edges.end).toBeLessThanOrEqual(1);
    expect(edges.bottom).toBeLessThanOrEqual(1);
  });
});

test.describe("on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "ios", "iOS's grouped sheet");
  });

  test("sets each detail in its own grouped card, its heading above and the file's value below", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);

    await expect(shown).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-grouped-sheet"),
    );
    const details = [
      ["Title", shown.getByRole("textbox", { name: "Title" })],
      ["People", shown.getByRole("group", { name: "People" })],
      ["Tags", shown.getByRole("group", { name: "Tags" })],
      ["Summary", shown.getByRole("textbox", { name: "Summary" })],
    ] as const;
    const cardColour = await tokenColour(page, "--native-color-card");
    expect(cardColour).not.toBe(
      await tokenColour(page, "--native-color-grouped-sheet"),
    );
    for (const [name, control] of details) {
      const card = control.locator('xpath=ancestor::*[@data-slot="card"]');
      await expect(card).toHaveCount(1);
      await expect(card).toHaveCSS("background-color", cardColour);
      await expect(card.getByText(name, { exact: true })).toHaveCount(0);
      await expect(card.getByText(/^From the file/)).toHaveCount(0);
    }
  });

  test("lets a card be its field, with grey chips and the file's value in footnote type", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);

    for (const name of ["Title", "Summary"]) {
      await expect(shown.getByRole("textbox", { name })).toHaveCSS(
        "border-top-width",
        "0px",
      );
    }
    await expect(
      shown.getByRole("button", { name: /^Remove .*Author A/ }),
    ).toHaveCSS("background-color", await tokenColour(page, "--color-chip"));
    const footnote = shown.getByText("From the file", { exact: true }).first();
    const footnoteSize = await footnote.evaluate((note) =>
      parseFloat(getComputedStyle(note).fontSize),
    );
    const bodySize = await shown
      .getByRole("textbox", { name: "Title" })
      .evaluate((field) => parseFloat(getComputedStyle(field).fontSize));
    expect(footnoteSize).toBeLessThan(bodySize);
  });

  test("heads each detail with its name, and says Edited in plain footnote type beside it", async ({
    page,
    platform,
  }) => {
    details = {
      ...FROM_FILES,
      title: {
        fromFile: FILE_TITLE,
        source: "folderName",
        edited: TYPED_TITLE,
      },
    };
    const shown = await openEditor(page, platform);
    await settle(shown);

    const heading = shown.getByText("Title", { exact: true });
    const status = shown.getByText("Edited", { exact: true });
    await expect(status).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const [headingBox, statusBox, headingSize, statusSize] = await Promise.all([
      boxOf(heading),
      boxOf(status),
      heading.evaluate((name) => parseFloat(getComputedStyle(name).fontSize)),
      status.evaluate((name) => parseFloat(getComputedStyle(name).fontSize)),
    ]);
    expect(statusSize).toBeLessThan(headingSize);
    expect(headingBox.x + headingBox.width).toBeLessThan(statusBox.x);
    expect(
      Math.abs(
        headingBox.y +
          headingBox.height / 2 -
          (statusBox.y + statusBox.height / 2),
      ),
    ).toBeLessThan(2);
  });

  test("undoes an edit from a plain icon-only button in the section head", async ({
    page,
    platform,
  }) => {
    details = {
      ...FROM_FILES,
      title: {
        fromFile: FILE_TITLE,
        source: "folderName",
        edited: TYPED_TITLE,
      },
    };
    const shown = await openEditor(page, platform);
    await settle(shown);

    const undo = shown.getByRole("button", { name: "Use the file’s title" });
    await expect(undo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(undo).toHaveCSS(
      "color",
      await tokenColour(page, "--native-color-on-button-plain"),
    );
    await expect(undo.locator("svg")).toHaveCSS("width", "18px");
    const [undoBox, statusBox] = await Promise.all([
      boxOf(undo),
      boxOf(shown.getByText("Edited", { exact: true })),
    ]);
    expect(undoBox.height).toBeCloseTo(
      await lengthOf(page, "--native-spacing-button"),
      0,
    );
    expect(statusBox.x + statusBox.width).toBeLessThan(undoBox.x);
  });

  test("sets the title as one raised row and the summary with the field's block padding", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);
    await settle(shown);

    const title = shown.getByRole("textbox", { name: "Title" });
    const titleCard = title.locator('xpath=ancestor::*[@data-slot="card"]');
    await expect(titleCard).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-card"),
    );
    await expect(titleCard).toHaveCSS("border-top-width", "0px");
    const rowHeight = await lengthOf(page, "--native-spacing-row");
    expect((await boxOf(titleCard)).height).toBeCloseTo(rowHeight, 0);
    expect((await boxOf(title)).height).toBeCloseTo(rowHeight, 0);
    await expect(shown.getByRole("textbox", { name: "Summary" })).toHaveCSS(
      "padding-top",
      `${String(await lengthOf(page, "--native-spacing-field-block"))}px`,
    );
  });

  test("drops the undo notice in at the top of the sheet, over its bar, and Undo brings the edit back", async ({
    page,
    platform,
  }) => {
    details = {
      ...FROM_FILES,
      title: {
        fromFile: FILE_TITLE,
        source: "folderName",
        edited: TYPED_TITLE,
      },
    };
    const shown = await openEditor(page, platform);
    await settle(shown);

    await tap(shown.getByRole("button", { name: "Use the file’s title" }));

    const notice = shown.getByRole("status");
    await expect(notice.getByText("Title back to the file’s")).toBeVisible();
    const [sheetBox, noticeBox, closeBox, fieldBox] = await Promise.all([
      boxOf(shown),
      boxOf(notice),
      boxOf(shown.getByRole("button", { name: "Close" })),
      boxOf(shown.getByRole("textbox", { name: "Title" })),
    ]);
    expect(noticeBox.y - sheetBox.y).toBeCloseTo(
      await lengthOf(page, "--native-spacing-sheet-notice-top"),
      0,
    );
    expect(noticeBox.y).toBeLessThan(closeBox.y + closeBox.height);
    expect(noticeBox.y + noticeBox.height).toBeLessThan(fieldBox.y);
    await tap(notice.getByRole("button", { name: "Undo" }));
    await expect(shown.getByRole("textbox", { name: "Title" })).toHaveValue(
      TYPED_TITLE,
    );
  });

  test("names each detail with a heading", async ({ page, platform }) => {
    const shown = await openEditor(page, platform);

    for (const name of ["Title", "People", "Tags", "Summary"]) {
      await expect(
        shown.getByRole("heading", { name, level: 3 }),
      ).toBeVisible();
    }
    await expect(shown.getByRole("textbox", { name: "Title" })).toBeVisible();
    await expect(shown.getByRole("textbox", { name: "Summary" })).toBeVisible();
  });

  test("raises Save as a filled pill and Close as a glass circle, the title between them", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);

    const save = shown.getByRole("button", { name: "Save" });
    const close = shown.getByRole("button", { name: "Close" });
    await expect(save).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-primary"),
    );
    const [closeBox, titleBox, saveBox] = await Promise.all([
      boxOf(close),
      boxOf(shown.getByRole("heading", { name: "Edit details" })),
      boxOf(save),
    ]);
    expect(closeBox.width).toBeCloseTo(closeBox.height, 0);
    expect(closeBox.x + closeBox.width).toBeLessThan(titleBox.x);
    expect(titleBox.x + titleBox.width).toBeLessThan(saveBox.x);
    const middle = titleBox.x + titleBox.width / 2;
    expect(Math.abs(middle - viewportOf(page).width / 2)).toBeLessThan(
      closeBox.width,
    );
  });

  test("opens as a large sheet over the series page", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);

    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
    await settle(shown);
    const sheet = await boxOf(shown);
    expect(
      Math.abs(
        sheet.height - (await lengthOf(page, "--native-spacing-sheet-large")),
      ),
    ).toBeLessThanOrEqual(1);
    expect(sheet.y + sheet.height).toBeCloseTo(viewportOf(page).height, 0);
  });

  test("sets the footnote a section's gap above the first detail", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);

    await settle(shown);
    const footnote = await boxOf(
      shown.getByText(
        "Your changes show only in Omnileaf; the files stay as they are.",
      ),
    );
    const title = await boxOf(shown.locator("section").first());
    expect(title.y - (footnote.y + footnote.height)).toBeCloseTo(
      await lengthOf(page, "--spacing-xl"),
      0,
    );
  });

  test("names the series to a screen reader behind the footnote", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);

    await expect(shown).toHaveAccessibleDescription(
      new RegExp(`${SERIES_TITLE}.*Your changes show only in Omnileaf`),
    );
  });

  test("says in a footnote that the changes stay in Omnileaf, with no Cancel in a footer", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);

    await expect(
      shown.getByText(
        "Your changes show only in Omnileaf; the files stay as they are.",
      ),
    ).toBeVisible();
    await expect(shown.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  });

  test("closes the sheet from Close when nothing changed", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);

    await tap(shown.getByRole("button", { name: "Close" }));

    await expect(shown).toHaveAttribute("data-state", "closed");
    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
  });

  test("asks before closing with unsaved changes, and Keep editing stays on the sheet", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);
    await shown.getByRole("textbox", { name: "Title" }).fill(TYPED_TITLE);

    await tap(shown.getByRole("button", { name: "Close" }));
    await expect(discardConfirm(page)).toBeVisible();
    await tap(
      discardConfirm(page).getByRole("button", { name: "Keep editing" }),
    );

    await expect(shown).toHaveAttribute("data-state", "open");
    await expect(shown.getByRole("textbox", { name: "Title" })).toHaveValue(
      TYPED_TITLE,
    );
  });

  test("saves from the bar and closes the sheet onto the series page", async ({
    page,
    platform,
  }) => {
    const shown = await openEditor(page, platform);
    await shown.getByRole("textbox", { name: "Title" }).fill(TYPED_TITLE);

    await tap(shown.getByRole("button", { name: "Save" }));

    await expect(shown).toHaveAttribute("data-state", "closed");
    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
    expect(sent).toHaveLength(1);
  });
});

test.describe("Edit details on an Android phone", { tag: "@native" }, () => {
  test("keeps Edit details as its own page, not a sheet", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "android", "Android's page");

    await openEditor(page, platform);

    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}/edit$`));
    await expect(
      page.getByRole("dialog", { name: "Edit details" }),
    ).toHaveCount(0);
  });
});

test.describe(
  "Edit details while the file's details load on an iPhone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "ios", "iOS's sheet bar");
    });

    test.use({
      backend: {
        ...EDITING_BACKEND,
        seriesDetails: () => new Promise(() => undefined),
      },
    });

    test("greys out Save until the details arrive", async ({
      page,
      platform,
    }) => {
      await askForEditor(page);
      const shown = editor(page, platform);

      const save = shown.getByRole("button", { name: "Save" });
      await expect(save).toBeDisabled();
      await expect(save).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-disabled"),
      );
      await expect(save).not.toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-button-primary"),
      );
    });
  },
);

test.describe(
  "Edit details opened straight to its page on an iPhone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "ios", "iOS's page");
    });

    test("keeps the Edited badge and the heading inside the page's card", async ({
      page,
    }) => {
      details = {
        ...FROM_FILES,
        title: {
          fromFile: FILE_TITLE,
          source: "folderName",
          edited: TYPED_TITLE,
        },
      };
      await page.goto(`/series/${SERIES_ID}/edit`);

      await expect(page.getByText("Edited", { exact: true })).toHaveCSS(
        "background-color",
        await tokenColour(page, "--color-chip"),
      );
      const titleCard = page
        .getByRole("textbox", { name: "Title" })
        .locator('xpath=ancestor::*[@data-slot="card"]');
      expect((await boxOf(titleCard)).height).toBeGreaterThan(
        await lengthOf(page, "--native-spacing-row"),
      );
    });

    test("sets the page on the grouped ground with Save as a filled pill", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}/edit`);

      await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
      await expect(page.locator('[data-ground="grouped"]')).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-grouped-ground"),
      );
      await expect(page.getByRole("button", { name: "Save" })).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-button-primary"),
      );
    });
  },
);

test.describe("Edit details on a wide iOS window", () => {
  test.use({
    backend: {
      ...EDITING_BACKEND,
      appInfo: onPlatform("ios").backend.appInfo,
    },
  });

  test("keeps the dialog with Cancel and Save in a footer", async ({
    page,
  }) => {
    test.skip(!isWide(page), "a phone opens the sheet");

    const shown = await openEditor(page);

    await expect(shown).not.toHaveAttribute("data-ground", "grouped");
    await expect(shown.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(shown.getByRole("button", { name: "Save" })).toBeVisible();
  });
});
