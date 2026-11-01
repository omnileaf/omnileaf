import type { Locator, Page } from "@playwright/test";

import type { SeriesDetails } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  literalColour,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const FROM_FILES = {
  title: { fromFile: SERIES_TITLE, source: "folderName", edited: null },
  people: { fromFile: [{ name: "Author A", role: "story" }], edited: null },
  tags: { fromFile: ["Seinen", "Sea"], edited: null },
  summary: { fromFile: "A lighthouse keeper’s apprentice.", edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;

const RATED_DETAILS = { ...FROM_FILES, isRatedAdult: true };

const FIELD = {
  height: 24,
  summaryHeight: 60,
  corner: "6px",
  inline: "8px",
  fontWeight: "510",
  fill: { light: "#ffffff", dark: "#1e1e1e" },
  rim: {
    light: "rgba(0, 0, 0, 0.05) 0px 0px 0px 1px",
    dark: "rgba(255, 255, 255, 0.04) 0px 0px 0px 1px",
    lightContrast: "rgb(88, 88, 88) 0px 0px 0px 1px",
    darkContrast: "rgb(175, 175, 175) 0px 0px 0px 1px",
  },
};

const NO_SHADOW = /^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/u;
const LINE_HEIGHT = 16;
const LINK_CORNER = "4px";

const CHECKBOX = {
  size: 16,
  corner: "5px",
  glyph: 10,
  labelGap: 6,
  noteGap: 4,
};

const RATED_NOTE =
  "Rated 18+ in the file. To change that, turn off Use age ratings from book details in Settings › Library.";
const RATINGS_OFF_NOTE =
  "The file rates it Adults Only 18+, but Use age ratings from book details is off in Settings › Library, so only this box counts.";

let details: SeriesDetails = FROM_FILES;
let sent: boolean[] = [];

const shelf = new FakeShelf([{ state: "notStarted" }]);

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  seriesOverview: (id) => shelf.backend().seriesOverview(id),
  seriesBooks: (id, listing, after) =>
    shelf.backend().seriesBooks(id, listing, after),
  keepsDetailEdits: () => true,
  seriesDetails: () => details,
  editSeriesDetails: (_, edits) => {
    sent = [...sent, edits.isMarkedAdult];
    return null;
  },
};

test.use({ viewport: { width: 1280, height: 800 }, backend: BACKEND });

test.beforeEach(() => {
  details = FROM_FILES;
  sent = [];
});

function endingWith(shadow: string): RegExp {
  return new RegExp(`${shadow.replaceAll(/[().]/gu, String.raw`\$&`)}$`, "u");
}

async function focusRing(page: Page, control: Locator): Promise<string[]> {
  await control.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.outlineStyle, style.outlineWidth, style.outlineColor];
  });
}

async function openEditor(page: Page, contrast?: "more"): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  if (contrast !== undefined) {
    await page.evaluate((value) => {
      document.documentElement.setAttribute("data-contrast", value);
    }, contrast);
  }
  await page
    .getByRole("region", { name: "Details" })
    .getByRole("button", { name: "Edit details" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Edit details" });
  await expect(sheet.getByRole("textbox", { name: "Title" })).toBeVisible();
  return sheet;
}

async function expectFieldLook(page: Page, field: Locator): Promise<void> {
  await expect(field).toHaveCSS(
    "background-color",
    await literalColour(page, FIELD.fill.light),
  );
  await expect(field).toHaveCSS("box-shadow", endingWith(FIELD.rim.light));
  await expect(field).toHaveCSS("border-top-width", "0px");
  await expect(field).toHaveCSS("border-top-left-radius", FIELD.corner);
  await expect(field).toHaveCSS("padding-left", FIELD.inline);
  await expect(field).toHaveCSS("font-size", "13px");
  await expect(field).toHaveCSS("font-weight", FIELD.fontWeight);
}

test.describe("Edit details fields on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use({ platform: "macos" });

  test("draws the title as a 24 tall field padded 4 above and below", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const title = sheet.getByRole("textbox", { name: "Title" });

    expect((await boxOf(title)).height).toBeCloseTo(FIELD.height, 0);
    await expectFieldLook(page, title);
    await expect(title).toHaveCSS("padding-top", "4px");
  });

  test("draws the summary as a three line field padded 6 above and below", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const summary = sheet.getByRole("textbox", { name: "Summary" });

    expect((await boxOf(summary)).height).toBeCloseTo(FIELD.summaryHeight, 0);
    await expectFieldLook(page, summary);
    await expect(summary).toHaveCSS("padding-top", "6px");
  });

  test("keeps the summary at three lines and padding when the text is scaled up", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const summary = sheet.getByRole("textbox", { name: "Summary" });
    const scale = 1.5;

    await page.evaluate((value) => {
      document.documentElement.style.setProperty("--text-scale", String(value));
    }, scale);

    expect((await boxOf(summary)).height).toBeCloseTo(
      3 * LINE_HEIGHT * scale + 12,
      0,
    );
  });

  test("draws the typed name field as a 24 tall field like the title", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    await sheet.getByRole("button", { name: "Add a tag" }).click();
    const typing = sheet.getByRole("textbox", { name: "Add a tag" });

    expect((await boxOf(typing)).height).toBeCloseTo(FIELD.height, 0);
    await expectFieldLook(page, typing);
  });

  for (const [name, colorScheme, contrast, fill, rim] of [
    ["dark", "dark", undefined, FIELD.fill.dark, FIELD.rim.dark],
    [
      "Increase contrast",
      "light",
      "more",
      FIELD.fill.light,
      FIELD.rim.lightContrast,
    ],
    [
      "dark with Increase contrast",
      "dark",
      "more",
      FIELD.fill.dark,
      FIELD.rim.darkContrast,
    ],
  ] as const) {
    test(`fills the fields and draws their rim from the ${name} values`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      const sheet = await openEditor(page, contrast);
      const title = sheet.getByRole("textbox", { name: "Title" });

      await expect(title).toHaveCSS(
        "background-color",
        await literalColour(page, fill),
      );
      await expect(title).toHaveCSS("box-shadow", endingWith(rim));
    });
  }

  test("rings a focused field the way it rings a focused chip", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const chip = sheet.getByRole("button", { name: "Remove Seinen" });

    const chipRing = await focusRing(page, chip);
    const fieldRing = await focusRing(
      page,
      sheet.getByRole("textbox", { name: "Title" }),
    );

    expect(fieldRing).toEqual(chipRing);
    expect(fieldRing[0]).toBe("solid");
  });

  test("draws Mark as 18+ as a 16 point checkbox with a 5 point corner in the field column", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const field = await boxOf(sheet.getByRole("textbox", { name: "Title" }));
    const mark = sheet.getByRole("checkbox", { name: "Mark as 18+" });
    const words = sheet.getByText("Mark as 18+", { exact: true });

    const box = await boxOf(mark);
    const wordsBox = await boxOf(words);

    expect(box.x).toBeCloseTo(field.x, 0);
    expect(box.width).toBeCloseTo(CHECKBOX.size, 0);
    expect(box.height).toBeCloseTo(CHECKBOX.size, 0);
    expect(wordsBox.x - (box.x + box.width)).toBeCloseTo(CHECKBOX.labelGap, 0);
    await expect(mark).toHaveCSS("border-top-left-radius", CHECKBOX.corner);
    await expect(mark).toHaveCSS("border-top-width", "0px");
    await expect(mark).toHaveCSS(
      "background-color",
      await literalColour(page, FIELD.fill.light),
    );
    await expect(words).toHaveCSS("font-size", "13px");
    await expect(words).toHaveCSS("font-weight", FIELD.fontWeight);
  });

  test("fills the box with the accent and a tick once it is marked, and saves the mark", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const mark = sheet.getByRole("checkbox", { name: "Mark as 18+" });

    await sheet.getByText("Mark as 18+", { exact: true }).click();

    await expect(mark).toBeChecked();
    await expect(mark).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-accent"),
    );
    await expect(mark).toHaveCSS("box-shadow", NO_SHADOW);
    expect((await boxOf(mark.locator("svg"))).width).toBeCloseTo(
      CHECKBOX.glyph,
      0,
    );
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => sent).toEqual([true]);
  });

  test("plates the box in the dark field fill in the dark theme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const sheet = await openEditor(page);
    const mark = sheet.getByRole("checkbox", { name: "Mark as 18+" });

    await expect(mark).toHaveCSS(
      "background-color",
      await literalColour(page, FIELD.fill.dark),
    );
  });

  test("greys the unticked box while it is pressed", async ({ page }) => {
    const sheet = await openEditor(page);
    const mark = sheet.getByRole("checkbox", { name: "Mark as 18+" });
    const { x, y, width, height } = await boxOf(mark);

    await page.mouse.move(x + width / 2, y + height / 2);
    await page.mouse.down();

    await expect(mark).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-control-fill-pressed"),
    );
  });

  test("puts the note 4 under the label in 11 point text", async ({ page }) => {
    const sheet = await openEditor(page);
    const field = await boxOf(sheet.getByRole("textbox", { name: "Title" }));
    const note = sheet.getByText("The file has no age rating.");

    const words = await boxOf(sheet.getByText("Mark as 18+", { exact: true }));
    const noteBox = await boxOf(note);

    expect(noteBox.x).toBeCloseTo(field.x, 0);
    expect(noteBox.y - (words.y + words.height)).toBeCloseTo(
      CHECKBOX.noteGap,
      0,
    );
    await expect(note).toHaveCSS("font-size", "11px");
  });

  test.describe("for a file rated 18+", () => {
    test.beforeEach(() => {
      details = RATED_DETAILS;
    });

    test("ticks the box, locks it at half strength and keeps the note", async ({
      page,
    }) => {
      const sheet = await openEditor(page);
      const mark = sheet.getByRole("checkbox", { name: "Mark as 18+" });

      await expect(mark).toBeChecked();
      await expect(mark).toBeDisabled();
      await expect(mark).toHaveCSS("opacity", "0.5");
      await expect(sheet.getByText("Mark as 18+", { exact: true })).toHaveCSS(
        "color",
        await tokenColour(page, "--color-muted"),
      );
      await expect(mark).toHaveAccessibleDescription(RATED_NOTE);
    });

    test("links Settings › Library in the accent without an underline until it is hovered", async ({
      page,
    }) => {
      const sheet = await openEditor(page);
      const link = sheet.getByRole("link", { name: "Settings › Library" });

      await expect(link).toHaveAttribute(
        "href",
        "/settings/library/adult-content",
      );
      await expect(link).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-link"),
      );
      await expect(link).toHaveCSS("text-decoration-line", "none");
      await expect(link).toHaveCSS("font-size", "11px");
      await expect(link).toHaveCSS("border-top-left-radius", LINK_CORNER);

      await link.hover();

      await expect(link).toHaveCSS("text-decoration-line", "underline");
      await expect(link).toHaveCSS("text-underline-offset", "2px");
    });
  });

  test.describe("while age ratings are off", () => {
    test.use({
      backend: {
        ...BACKEND,
        seriesDetails: () => RATED_DETAILS,
        libraryAdultContent: () => ({
          treatment: "show",
          countsAgeRatings: false,
        }),
      },
    });

    test("says only this box counts and lets the box decide", async ({
      page,
    }) => {
      const sheet = await openEditor(page);
      const mark = sheet.getByRole("checkbox", { name: "Mark as 18+" });

      await expect(mark).not.toBeChecked();
      await expect(mark).toBeEnabled();
      await expect(mark).toHaveAccessibleDescription(RATINGS_OFF_NOTE);
    });
  });
});

for (const platform of ["linux", "windows", "android", "ios"] as const) {
  test.describe(`Edit details fields on ${platform}`, () => {
    test.use({ platform });

    test("keeps the bordered field and the switch for Mark as 18+", async ({
      page,
    }) => {
      const sheet = await openEditor(page);
      const title = sheet.getByRole("textbox", { name: "Title" });

      await expect(title).not.toHaveCSS(
        "box-shadow",
        endingWith(FIELD.rim.light),
      );
      await expect(title).not.toHaveCSS("border-top-width", "0px");
      await expect(title).not.toHaveCSS(
        "background-color",
        await literalColour(page, FIELD.fill.light),
      );
      await expect(
        sheet.getByRole("switch", { name: "Mark as 18+" }),
      ).toBeVisible();
      await expect(
        sheet.getByRole("checkbox", { name: "Mark as 18+" }),
      ).toHaveCount(0);
    });
  });
}
