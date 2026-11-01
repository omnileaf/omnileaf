import type { Locator, Page } from "@playwright/test";

import type { SeriesDetails } from "../../src/lib/ipc/bindings.ts";
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

const WINDOW = { width: 1280, height: 800 };

const EDITED_DETAILS = {
  title: {
    fromFile: SERIES_TITLE,
    source: "folderName",
    edited: "The Harbour Gate",
  },
  people: {
    fromFile: [{ name: "Author A", role: "story" }],
    edited: [
      { name: "Author A", role: "story" },
      { name: "Author C", role: "art" },
    ],
  },
  tags: { fromFile: ["Seinen", "Sea"], edited: ["Seinen", "Sea", "Slice"] },
  summary: { fromFile: "A lighthouse keeper’s apprentice.", edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;

const shelf = new FakeShelf([{ state: "notStarted" }]);

const MACOS = {
  labelColumn: 99,
  endColumn: 96,
  columnGap: 8,
  rowGap: 12,
  endGap: 4,
  chip: { height: 24, corner: "6px", inline: "10px", gap: 6, cross: 10 },
  addButton: { corner: "5px", fontSize: "11px" },
  badge: { height: 18, corner: "5px", inline: "6px", fontSize: "11px" },
  undo: { size: 24, icon: 13 },
  buttonWeight: "510",
  control: { height: 24, fontSize: "13px" },
  labelInset: { oneLine: "4px", multiline: "6px" },
};

const NARROW_WINDOW = { width: 500, height: 800 };

test.use({
  viewport: WINDOW,
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    keepsDetailEdits: () => true,
    seriesDetails: () => EDITED_DETAILS,
  },
});

function editor(page: Page): Locator {
  return page.getByRole("dialog", { name: "Edit details" });
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
  await expect(
    editor(page).getByRole("textbox", { name: "Title" }),
  ).toBeVisible();
  return editor(page);
}

function rowOf(control: Locator): Locator {
  return control.locator("xpath=..");
}

async function focusRing(page: Page, control: Locator): Promise<string[]> {
  await control.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.outlineStyle, style.outlineWidth, style.outlineOffset];
  });
}

test.describe("Edit details rows on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use({ platform: "macos" });

  test("sets a 99 wide label column, the field 8 after it and a 96 wide column for Edited at the trailing edge", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const title = sheet.getByRole("textbox", { name: "Title" });
    const row = await boxOf(rowOf(title));

    const label = await boxOf(sheet.getByText("Title", { exact: true }));
    const field = await boxOf(title);
    const undo = await boxOf(
      sheet.getByRole("button", { name: "Use the file’s title" }),
    );

    expect(label.width).toBeCloseTo(MACOS.labelColumn, 0);
    expect(field.x - (label.x + label.width)).toBeCloseTo(MACOS.columnGap, 0);
    expect(row.x + row.width - (field.x + field.width)).toBeCloseTo(
      MACOS.endColumn + MACOS.columnGap,
      0,
    );
    expect(undo.x + undo.width).toBeCloseTo(row.x + row.width, 0);
    await expect(sheet.getByText("Title", { exact: true })).toHaveCSS(
      "text-align",
      "end",
    );
  });

  test("puts 12 between the rows and draws them without a card", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const title = rowOf(sheet.getByRole("textbox", { name: "Title" }));
    const people = rowOf(sheet.getByRole("group", { name: "People" }));

    const titleBox = await boxOf(title);
    const peopleBox = await boxOf(people);

    expect(peopleBox.y - (titleBox.y + titleBox.height)).toBeCloseTo(
      MACOS.rowGap,
      0,
    );
    const section = rowOf(title);
    await expect(section).toHaveCSS(
      "background-color",
      await literalColour(page, "transparent"),
    );
    await expect(section).toHaveCSS("border-top-left-radius", "0px");
    await expect(section).toHaveCSS("padding-left", "0px");
  });

  test("draws Edited as a grey 18 tall tag beside a 24 plain Undo button", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const badge = sheet.getByText("Edited").first();
    const undo = sheet.getByRole("button", { name: "Use the file’s title" });

    const badgeBox = await boxOf(badge);
    const undoBox = await boxOf(undo);

    expect(badgeBox.height).toBeCloseTo(MACOS.badge.height, 0);
    expect(undoBox.x - (badgeBox.x + badgeBox.width)).toBeCloseTo(
      MACOS.endGap,
      0,
    );
    expect(undoBox.width).toBeCloseTo(MACOS.undo.size, 0);
    expect(undoBox.height).toBeCloseTo(MACOS.undo.size, 0);
    expect((await boxOf(undo.locator("svg"))).width).toBeCloseTo(
      MACOS.undo.icon,
      0,
    );
    await expect(undo).toHaveCSS(
      "background-color",
      await literalColour(page, "transparent"),
    );
    await expect(badge).toHaveCSS("border-top-left-radius", MACOS.badge.corner);
    await expect(badge).toHaveCSS("padding-left", MACOS.badge.inline);
    await expect(badge).toHaveCSS("font-size", MACOS.badge.fontSize);
    await expect(badge).toHaveCSS("font-weight", MACOS.buttonWeight);
    await expect(badge).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-secondary"),
    );
    await expect(badge).toHaveCSS(
      "color",
      await tokenColour(page, "--secondary-text"),
    );
  });

  test("names the file's value in Undo's help tag", async ({ page }) => {
    const sheet = await openEditor(page);

    await sheet.getByRole("button", { name: "Use the file’s title" }).hover();

    await expect(page.locator("[data-tooltip-content]")).toHaveText(
      "Use the file’s title",
    );
  });

  test("draws chips 24 tall and 6 apart with a 10 cross, and adds with small secondary buttons", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const seinen = sheet.getByRole("button", { name: "Remove Seinen" });
    const sea = sheet.getByRole("button", { name: "Remove Sea" });
    const addPerson = sheet.getByRole("button", { name: "Add a person" });
    const fill = await tokenColour(page, "--native-color-button-secondary");

    const seinenBox = await boxOf(seinen);
    const seaBox = await boxOf(sea);

    expect(seinenBox.height).toBeCloseTo(MACOS.chip.height, 0);
    expect(seaBox.x - (seinenBox.x + seinenBox.width)).toBeCloseTo(
      MACOS.chip.gap,
      0,
    );
    expect((await boxOf(seinen.locator("svg"))).width).toBeCloseTo(
      MACOS.chip.cross,
      0,
    );
    await expect(seinen).toHaveCSS("border-top-left-radius", MACOS.chip.corner);
    await expect(seinen).toHaveCSS("padding-left", MACOS.chip.inline);
    await expect(seinen).toHaveCSS("font-weight", MACOS.buttonWeight);
    await expect(seinen).toHaveCSS("border-top-width", "0px");
    await expect(seinen).toHaveCSS("background-color", fill);
    await expect(addPerson).toHaveCSS(
      "border-top-left-radius",
      MACOS.addButton.corner,
    );
    await expect(addPerson).toHaveCSS("font-size", MACOS.addButton.fontSize);
    await expect(addPerson).toHaveCSS("background-color", fill);
  });

  test("sets the label 6 down for a tall field and 4 for the one line title", async ({
    page,
  }) => {
    const sheet = await openEditor(page);

    await expect(sheet.getByText("Title", { exact: true })).toHaveCSS(
      "padding-top",
      MACOS.labelInset.oneLine,
    );
    await expect(sheet.getByText("Summary", { exact: true })).toHaveCSS(
      "padding-top",
      MACOS.labelInset.multiline,
    );
  });

  test("draws the title as a 24 tall line of 13 point text and the summary in 13 point text", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const title = sheet.getByRole("textbox", { name: "Title" });
    const summary = sheet.getByRole("textbox", { name: "Summary" });

    const titleBox = await boxOf(title);

    expect(titleBox.height).toBeCloseTo(MACOS.control.height, 0);
    await expect(title).toHaveCSS("font-size", MACOS.control.fontSize);
    await expect(summary).toHaveCSS("font-size", MACOS.control.fontSize);
  });

  test("lines the Mark as 18+ checkbox up under the fields without bleeding into the sheet", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const field = await boxOf(sheet.getByRole("textbox", { name: "Title" }));
    const row = await boxOf(
      rowOf(sheet.getByRole("textbox", { name: "Title" })),
    );
    const adult = await boxOf(
      sheet.getByRole("checkbox", { name: /Mark as 18\+/u }),
    );

    expect(adult.x).toBeCloseTo(field.x, 0);
    expect(adult.x + adult.width).toBeLessThanOrEqual(row.x + row.width);
  });

  test("keeps the typing field as tall as the chips", async ({ page }) => {
    const sheet = await openEditor(page);
    const chip = await boxOf(sheet.getByRole("button", { name: "Remove Sea" }));

    await sheet.getByRole("button", { name: "Add a tag" }).click();
    const typing = sheet.getByRole("textbox", { name: "Add a tag" });
    const typingBox = await boxOf(typing);

    expect(typingBox.height).toBeCloseTo(chip.height, 0);
    await expect(typing).toHaveCSS("font-size", MACOS.control.fontSize);
  });

  test("draws the keyboard focus ring on a chip the way it does on the Add button", async ({
    page,
  }) => {
    const sheet = await openEditor(page);

    const chipRing = await focusRing(
      page,
      sheet.getByRole("button", { name: "Remove Seinen" }),
    );
    const addRing = await focusRing(
      page,
      sheet.getByRole("button", { name: "Add a tag" }),
    );

    expect(chipRing).toEqual(addRing);
  });

  test("lays the fields out label above field in a narrow window", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    await page.setViewportSize(NARROW_WINDOW);
    const label = sheet.getByText("Title", { exact: true });
    const field = sheet.getByRole("textbox", { name: "Title" });

    await expect
      .poll(async () => {
        const labelBox = await boxOf(label);
        const fieldBox = await boxOf(field);
        return labelBox.y + labelBox.height <= fieldBox.y;
      })
      .toBe(true);
    expect((await boxOf(label)).width).toBeGreaterThan(MACOS.labelColumn);
  });

  for (const [name, colorScheme, contrast] of [
    ["dark", "dark", undefined],
    ["Increase contrast", "light", "more"],
    ["dark with Increase contrast", "dark", "more"],
  ] as const) {
    test(`fills Edited and the chips from the ${name} tokens`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      const sheet = await openEditor(page, contrast);
      const fill = await tokenColour(page, "--native-color-button-secondary");

      await expect(sheet.getByText("Edited").first()).toHaveCSS(
        "background-color",
        fill,
      );
      await expect(
        sheet.getByRole("button", { name: "Remove Seinen" }),
      ).toHaveCSS("background-color", fill);
    });
  }
});

for (const platform of ["linux", "windows", "android", "ios"] as const) {
  test.describe(`Edit details rows on ${platform}`, () => {
    test.use({ platform });

    test("keeps the label above the field, the outlined chips and the card", async ({
      page,
    }) => {
      const sheet = await openEditor(page);
      const title = sheet.getByRole("textbox", { name: "Title" });
      const label = await boxOf(sheet.getByText("Title", { exact: true }));
      const field = await boxOf(title);

      expect(label.y + label.height).toBeLessThanOrEqual(field.y);
      await expect(
        sheet.getByRole("button", { name: "Remove Seinen" }),
      ).toHaveCSS("border-top-width", "1px");
      await expect(rowOf(rowOf(title))).toHaveCSS("border-top-width", "1px");
    });

    test("keeps Edited as the chip coloured tag, the plain Undo and the outlined Add chip", async ({
      page,
    }) => {
      const sheet = await openEditor(page);
      const badge = sheet.getByText("Edited").first();
      const undo = sheet.getByRole("button", { name: "Use the file’s title" });

      const badgeBox = await boxOf(badge);

      expect(badgeBox.height).not.toBeCloseTo(MACOS.badge.height, 0);
      await expect(badge).toHaveCSS(
        "background-color",
        await tokenColour(page, "--color-chip"),
      );
      await expect(badge).not.toHaveCSS("font-size", MACOS.badge.fontSize);
      await expect(undo).not.toHaveCSS("width", `${String(MACOS.undo.size)}px`);
      await expect(
        sheet.getByRole("button", { name: "Add a person" }),
      ).toHaveCSS("border-top-width", "1px");
    });
  });
}
