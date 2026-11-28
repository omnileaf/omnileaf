import type { Locator, Page } from "@playwright/test";

import type { LibraryFilterChoices } from "../../src/lib/ipc/bindings.ts";
import { NEW_LIBRARY_LISTING } from "../../src/lib/library/library-listing.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  framesPassed,
  setTextScale,
  settle,
  test,
  tokenColour,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const EMPTY_NOTE_TO_ACTION = 16;
const LIBRARY = sampleSeries(12);
const FEW_CHOICES: LibraryFilterChoices = {
  formats: [],
  languages: [],
  tags: [],
  ratesAdult: false,
  keepsBookmarks: false,
  smart: [],
};
const MANY_CHOICES: LibraryFilterChoices = {
  formats: ["comic", "manga", "book"],
  languages: ["ja", "en", "fr", "de"],
  tags: ["Slice of life", "Seinen", "Sea", "Cooking", "Travel", "School"],
  ratesAdult: true,
  keepsBookmarks: true,
  smart: ["quickReads", "forgotten", "duplicates"],
};
const TITLE_SIZE = "22px";
const TITLE_LINE = "28px";
const TITLE_WEIGHT = "400";
const SHEET_INLINE_PADDING = 16;
const SHEET_TOP_GAP = 60;
const HEAD_END_PADDING = 12;
const FOOT_BUTTON_HEIGHT = 56;
const FOOT_BOTTOM = 16;
const FOOT_TOP = 12;
const SEPARATOR_WIDTH = "1px";
const FIELD_HEIGHT = 56;
const FIELD_RADIUS = "4px";
const FIELD_BORDER = "1px";
const FIELD_LABEL_SIZE = "12px";
const FIELD_LABEL_LINE = "16px";
const ORDER_BUTTON_SIZE = 40;
const SORT_ROW_GAP = 8;
const HEADING_SIZE = "14px";
const HEADING_LINE = "20px";
const HEADING_WEIGHT = "500";
const HEADING_TOP = 12;
const SETTING_START = 16;
const SETTING_END = 24;
const SEGMENT_HEIGHT = 40;
const SEGMENT_GAP = 2;
const CHIP_HEIGHT = 32;
const CHIP_RADIUS = "8px";
const ROW_TITLE_SIZE = "16px";
const ROW_TITLE_LINE = "24px";
const REMOVE_ICON_SIZE = 18;
const CHIPS_ROW_START = 16;
const ROW_SETTINGS = ["Display", "Covers per row"] as const;
const SETTING_BLOCK_PADDING = "8px";
const SETTING_COLUMN_GAP = "16px";
const SETTING_ROW_GAP = 8;
const STEPPER_GAP = "16px";
const SIDE_BY_SIDE = [
  { width: 360, names: ROW_SETTINGS },
  { width: 320, names: ["Covers per row"] },
] as const;
const SQUEEZED_WIDTH = 200;
const UNDER_ITS_NAME = [
  { textSize: "system", width: 320 },
  { textSize: "larger", width: 320 },
] as const;
const LARGE_TEXT = [
  { scale: 1.3, width: 390 },
  { scale: 1.3, width: 360 },
  { scale: 2, width: 390 },
] as const;
const FILTERED_LISTING = {
  ...NEW_LIBRARY_LISTING,
  filter: {
    ...NEW_LIBRARY_LISTING.filter,
    formats: ["manga" as const],
    tags: ["Sea"],
  },
};

function backendWith(choices: LibraryFilterChoices) {
  return {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryFilterChoices: () => choices,
  };
}

async function openSheet(page: Page): Promise<Locator> {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toContainText(
    LIBRARY[0]?.title ?? "",
  );
  await page.getByRole("button", { name: /^Sort and filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Sort and filter" });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  return sheet;
}

function showButton(sheet: Locator): Locator {
  return sheet.getByRole("button", { name: /^Show \d+ series$/ });
}

test.describe(
  "the library's sort and filter sheet on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Material sheet");
    });

    test.describe("with few choices", () => {
      test.use({ backend: backendWith(FEW_CHOICES) });

      test("sets the title at title large with no badge before it", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const title = sheet.getByRole("heading", { name: "Sort and filter" });

        await expect(title).toHaveCSS("font-size", TITLE_SIZE);
        await expect(title).toHaveCSS("line-height", TITLE_LINE);
        await expect(title).toHaveCSS("font-weight", TITLE_WEIGHT);
        expect((await boxOf(title)).x - (await boxOf(sheet)).x).toBeCloseTo(
          SHEET_INLINE_PADDING,
          0,
        );
      });

      test("ends the title row with Reset, 12px in from the edge", async ({
        page,
      }) => {
        const sheet = await openSheet(page);

        const sheetBox = await boxOf(sheet);
        const reset = await boxOf(sheet.getByRole("button", { name: "Reset" }));

        expect(
          sheetBox.x + sheetBox.width - (reset.x + reset.width),
        ).toBeCloseTo(HEAD_END_PADDING, 0);
      });

      test("fills the Show button 56px tall across the sheet, 16px from the foot", async ({
        page,
      }) => {
        const sheet = await openSheet(page);

        const sheetBox = await boxOf(sheet);
        const show = await boxOf(showButton(sheet));

        expect(show.height).toBeCloseTo(FOOT_BUTTON_HEIGHT, 0);
        expect(show.x - sheetBox.x).toBeCloseTo(SHEET_INLINE_PADDING, 0);
        expect(show.width).toBeCloseTo(
          sheetBox.width - 2 * SHEET_INLINE_PADDING,
          0,
        );
        expect(
          sheetBox.y + sheetBox.height - (show.y + show.height),
        ).toBeCloseTo(FOOT_BOTTOM, 0);
      });

      test("sets the Show button 12px under the last setting and draws no divider while everything fits", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const foot = showButton(sheet).locator("xpath=..");

        await expect(foot).toHaveCSS("border-top-width", "0px");
        expect(
          (await boxOf(showButton(sheet))).y - (await boxOf(foot)).y,
        ).toBeCloseTo(FOOT_TOP, 0);
      });
    });

    test.describe("the sort row", () => {
      test.use({ backend: backendWith(FEW_CHOICES) });

      test("sets Sort by as a 56px outlined field with a 4px corner", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const field = sheet.getByRole("combobox", { name: "Sort by" });

        expect((await boxOf(field)).height).toBeCloseTo(FIELD_HEIGHT, 0);
        await expect(field).toHaveCSS("border-top-width", FIELD_BORDER);
        await expect(field).toHaveCSS("border-top-left-radius", FIELD_RADIUS);
        await expect(field).toHaveCSS(
          "border-top-color",
          await tokenColour(page, "--native-color-button-outline-edge"),
        );
      });

      test("sits the label on the field's top edge at 12px on a 16px line, over the sheet's own ground", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const field = sheet.getByRole("combobox", { name: "Sort by" });
        const label = sheet.getByText("Sort by", { exact: true });

        const fieldBox = await boxOf(field);
        const labelBox = await boxOf(label);

        await expect(label).toHaveCSS("font-size", FIELD_LABEL_SIZE);
        await expect(label).toHaveCSS("line-height", FIELD_LABEL_LINE);
        expect(labelBox.y + labelBox.height / 2).toBeCloseTo(fieldBox.y, 0);
        await expect(label).toHaveCSS(
          "background-color",
          await sheet.evaluate(
            (element) => getComputedStyle(element).backgroundColor,
          ),
        );
      });

      test("puts the field 16px from the sheet's edge with the order button 8px after it, a 40px outlined circle", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const field = await boxOf(
          sheet.getByRole("combobox", { name: "Sort by" }),
        );
        const order = sheet.getByRole("button", { name: /^Order:/ });
        const orderBox = await boxOf(order);
        const sheetBox = await boxOf(sheet);

        expect(field.x - sheetBox.x).toBeCloseTo(SHEET_INLINE_PADDING, 0);
        expect(orderBox.x - (field.x + field.width)).toBeCloseTo(
          SORT_ROW_GAP,
          0,
        );
        expect(orderBox.width).toBeCloseTo(ORDER_BUTTON_SIZE, 0);
        expect(orderBox.height).toBeCloseTo(ORDER_BUTTON_SIZE, 0);
        await expect(order).toHaveCSS(
          "border-top-color",
          await tokenColour(page, "--native-color-button-outline-edge"),
        );
      });

      test("reverses the order from the button", async ({ page }) => {
        const sheet = await openSheet(page);
        const order = sheet.getByRole("button", { name: /^Order:/ });
        const before = await order.getAttribute("aria-label");

        await order.click();

        await expect(order).not.toHaveAttribute("aria-label", before ?? "");
      });

      test("sorts by what is picked from the field's menu", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const field = sheet.getByRole("combobox", { name: "Sort by" });

        await field.click();
        await page
          .getByRole("listbox", { name: "Sort by" })
          .getByRole("option", { name: "Recently read" })
          .click();

        await expect(page.getByRole("listbox")).toBeHidden();
        await expect(field).toHaveText("Recently read");
        await expect(sheet).toBeVisible();
      });
    });

    test.describe("the filter settings", () => {
      test.use({ backend: backendWith(MANY_CHOICES) });

      test("heads Sort and Filter at 14px on a 20px line at 500 in the accent, 12px under the section above", async ({
        page,
      }) => {
        const sheet = await openSheet(page);

        for (const name of ["Sort", "Filter"]) {
          const heading = sheet.getByRole("heading", { name, exact: true });
          await expect(heading).toHaveCSS("font-size", HEADING_SIZE);
          await expect(heading).toHaveCSS("line-height", HEADING_LINE);
          await expect(heading).toHaveCSS("font-weight", HEADING_WEIGHT);
          await expect(heading).toHaveCSS(
            "color",
            await tokenColour(page, "--native-color-on-button-plain"),
          );
          await expect(heading).toHaveCSS(
            "padding-top",
            String(HEADING_TOP) + "px",
          );
          await expect(heading).toHaveCSS(
            "padding-left",
            String(SETTING_START) + "px",
          );
        }
      });

      test("sets Read state as a label over a full-width group of 40px segments 2px apart, the chosen one filled", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const label = sheet.getByText("Read state", { exact: true });
        const group = sheet.getByRole("radiogroup", { name: "Read state" });
        const any = group.getByRole("radio", { name: "Any" });
        const unread = group.getByRole("radio", { name: "Unread" });

        const sheetBox = await boxOf(sheet);
        const groupBox = await boxOf(group);
        const anyBox = await boxOf(any);
        const unreadBox = await boxOf(unread);

        await expect(label).toHaveCSS("font-size", HEADING_SIZE);
        await expect(label).toHaveCSS("font-weight", HEADING_WEIGHT);
        expect(groupBox.x - sheetBox.x).toBeCloseTo(SETTING_START, 0);
        expect(
          sheetBox.x + sheetBox.width - (groupBox.x + groupBox.width),
        ).toBeCloseTo(SETTING_END, 0);
        expect(anyBox.height).toBeCloseTo(SEGMENT_HEIGHT, 0);
        expect(unreadBox.x - (anyBox.x + anyBox.width)).toBeCloseTo(
          SEGMENT_GAP,
          0,
        );
        await expect(any).toHaveCSS(
          "background-color",
          await tokenColour(page, "--native-color-segment-selected"),
        );
        await expect(unread).toHaveCSS(
          "background-color",
          await tokenColour(page, "--native-color-segment-fill"),
        );
      });

      test("sets 18+ with its words at the start and its group at the end of one row", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const sheetBox = await boxOf(sheet);
        const words = await boxOf(sheet.getByText("18+", { exact: true }));
        const group = await boxOf(
          sheet.getByRole("radiogroup", { name: "18+" }),
        );
        const hint = sheet.getByText("Adult age rating, or marked by hand.");

        expect(words.x - sheetBox.x).toBeCloseTo(SETTING_START, 0);
        expect(
          sheetBox.x + sheetBox.width - (group.x + group.width),
        ).toBeCloseTo(SETTING_END, 0);
        const hintBox = await boxOf(hint);
        expect(group.y).toBeLessThan(hintBox.y + hintBox.height);
        await expect(hint).toHaveCSS("font-size", HEADING_SIZE);
        await expect(hint).toHaveCSS("font-weight", "400");
      });

      test("keeps every 18+ and Bookmarked segment whole and inside the sheet at twice the text size on a narrow phone", async ({
        page,
      }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        const sheet = await openSheet(page);
        await page.addStyleTag({
          content: ":root { --text-scale: 2 !important; }",
        });
        await settle(sheet);

        for (const name of ["18+", "Bookmarked"]) {
          const group = sheet.getByRole("radiogroup", { name });
          await group.scrollIntoViewIfNeeded();
          const spill = await group.evaluate((track) => {
            const box = track.getBoundingClientRect();
            const cut = [...track.querySelectorAll("[role=radio]")].filter(
              (segment) => segment.scrollWidth > segment.clientWidth,
            ).length;
            return {
              cut,
              over: box.right - document.documentElement.clientWidth,
            };
          });
          expect(spill.cut).toBe(0);
          expect(spill.over).toBeLessThanOrEqual(0);
        }
      });

      test("chooses a read state from its segment", async ({ page }) => {
        const sheet = await openSheet(page);
        const group = sheet.getByRole("radiogroup", { name: "Read state" });

        await group.getByRole("radio", { name: "Unread" }).click();

        await expect(
          group.getByRole("radio", { name: "Unread" }),
        ).toBeChecked();
      });
    });

    test.describe("the chips and smart filters", () => {
      test.use({ backend: backendWith(MANY_CHOICES) });

      test("draws each chip 32px tall with an 8px corner and a 1px outline, 14px on a 20px line at 500", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const chip = sheet.getByRole("button", { name: "Manga" });

        expect((await boxOf(chip)).height).toBeCloseTo(CHIP_HEIGHT, 0);
        await expect(chip).toHaveCSS("border-top-left-radius", CHIP_RADIUS);
        await expect(chip).toHaveCSS("border-top-width", "1px");
        await expect(chip).toHaveCSS("font-size", HEADING_SIZE);
        await expect(chip).toHaveCSS("line-height", HEADING_LINE);
        await expect(chip).toHaveCSS("font-weight", HEADING_WEIGHT);
        await expect(chip).toHaveCSS(
          "border-top-color",
          await tokenColour(page, "--native-color-button-outline-edge"),
        );
      });

      test("fills a chosen chip with the soft accent and ticks it", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const chip = sheet.getByRole("button", { name: "Manga" });

        await chip.click();

        await expect(chip).toHaveAttribute("aria-pressed", "true");
        await expect(chip).toHaveCSS(
          "background-color",
          await tokenColour(page, "--native-color-accent-soft"),
        );
        await expect(chip.locator("[data-icon='check']")).toHaveCount(1);
        await expect(chip.locator("svg")).toHaveCount(0);
      });

      test("starts the chips 16px in from the sheet's edge, with no rule between settings", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const group = sheet.getByRole("group", { name: "Format" });

        expect((await boxOf(group)).x - (await boxOf(sheet)).x).toBeCloseTo(
          SETTING_START,
          0,
        );
        await expect(group.locator("xpath=..")).toHaveCSS(
          "border-top-width",
          "0px",
        );
      });

      test("sets each smart filter as a row with a 16px title, its hint under it and the row padded 16px and 24px", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const title = sheet.getByText("Quick reads", { exact: true });
        const toggle = sheet.getByRole("switch", { name: "Quick reads" });

        await expect(title).toHaveCSS("font-size", ROW_TITLE_SIZE);
        await expect(title).toHaveCSS("line-height", ROW_TITLE_LINE);
        await expect(toggle).toHaveCSS(
          "padding-left",
          String(SETTING_START) + "px",
        );
        await expect(toggle).toHaveCSS(
          "padding-right",
          String(SETTING_END) + "px",
        );
        await toggle.click();
        await expect(toggle).toBeChecked();
      });
    });

    test.describe("the filters in use", () => {
      test.use({
        backend: {
          ...backendWith(MANY_CHOICES),
          libraryListing: () => FILTERED_LISTING,
        },
      });

      async function openLibrary(page: Page): Promise<Locator> {
        await page.goto("/");
        await expect(page.getByRole("list", { name: "Series" })).toContainText(
          LIBRARY[0]?.title ?? "",
        );
        return page.getByRole("list", { name: "Filters in use" });
      }

      test("draws each filter as a 32px chip with an 8px corner and a 1px outline, 16px in from the edge", async ({
        page,
      }) => {
        const chips = await openLibrary(page);
        const chip = chips.getByRole("listitem").first();

        const chipBox = await boxOf(chip);

        expect(chipBox.height).toBeCloseTo(CHIP_HEIGHT, 0);
        expect(chipBox.x).toBeCloseTo(CHIPS_ROW_START, 0);
        await expect(chip).toHaveCSS("border-top-left-radius", CHIP_RADIUS);
        await expect(chip).toHaveCSS("border-top-width", "1px");
        await expect(chip).toHaveCSS(
          "border-top-color",
          await tokenColour(page, "--native-color-button-outline-edge"),
        );
      });

      test("ends each chip with an 18px cross that removes the filter", async ({
        page,
      }) => {
        const chips = await openLibrary(page);
        const remove = chips.getByRole("button", { name: /^Remove / }).first();

        const icon = await boxOf(remove.locator("svg"));
        await remove.click();

        expect(icon.width).toBeCloseTo(REMOVE_ICON_SIZE, 0);
        await expect(chips.getByRole("listitem")).toHaveCount(1);
      });

      test("sets Clear all as a plain button at the end of the line", async ({
        page,
      }) => {
        await openLibrary(page);
        const clear = page.getByRole("button", { name: "Clear all" });

        await expect(clear).toHaveCSS(
          "color",
          await tokenColour(page, "--native-color-on-button-plain"),
        );
        const box = await boxOf(clear);
        expect(box.x + box.width).toBeGreaterThan(
          (page.viewportSize()?.width ?? 0) - 24,
        );
      });
    });

    test.describe("the view options sheet", () => {
      test.use({ backend: backendWith(FEW_CHOICES) });

      async function openView(page: Page): Promise<Locator> {
        await page.goto("/");
        await expect(page.getByRole("list", { name: "Series" })).toContainText(
          LIBRARY[0]?.title ?? "",
        );
        await page.getByRole("button", { name: "View options" }).click();
        const sheet = page.getByRole("dialog", { name: "View options" });
        await expect(sheet).toBeVisible();
        await settle(sheet);
        return sheet;
      }

      test("leaves the top of the screen showing, as the sort and filter sheet does", async ({
        page,
      }) => {
        const sheet = await openView(page);

        const box = await boxOf(sheet);

        expect(box.y).toBeGreaterThanOrEqual(SHEET_TOP_GAP);
      });

      test("sets the title at title large with no badge and says what it holds under it", async ({
        page,
      }) => {
        const sheet = await openView(page);
        const title = sheet.getByRole("heading", { name: "View options" });
        const note = sheet.getByText("Kept on this phone", { exact: false });

        await expect(title).toHaveCSS("font-size", TITLE_SIZE);
        await expect(title).toHaveCSS("font-weight", TITLE_WEIGHT);
        expect((await boxOf(title)).x - (await boxOf(sheet)).x).toBeCloseTo(
          SHEET_INLINE_PADDING,
          0,
        );
        await expect(note).toHaveCSS("font-size", HEADING_SIZE);
        await expect(note).toHaveCSS("line-height", HEADING_LINE);
        await expect(sheet.getByRole("button", { name: "Done" })).toHaveCount(
          0,
        );
      });

      test("heads Layout and Show on covers in the green accent", async ({
        page,
      }) => {
        const sheet = await openView(page);

        for (const name of ["Layout", "Show on covers"]) {
          const heading = sheet.getByRole("heading", { name, exact: true });
          await expect(heading).toHaveCSS("font-size", HEADING_SIZE);
          await expect(heading).toHaveCSS("font-weight", HEADING_WEIGHT);
          await expect(heading).toHaveCSS(
            "color",
            await tokenColour(page, "--native-color-on-button-plain"),
          );
        }
      });

      test("sets Group by on its own line, its hint under it and its four choices across the row, Creator last", async ({
        page,
      }) => {
        const sheet = await openView(page);
        const sheetBox = await boxOf(sheet);
        const label = sheet.getByText("Group by", { exact: true });
        const words = await boxOf(label);
        const hint = await boxOf(
          sheet.getByText("Creator puts each series under its writer"),
        );
        const group = sheet.getByRole("radiogroup", {
          name: "Group by",
          exact: true,
        });
        const groupBox = await boxOf(group);

        expect(words.x - sheetBox.x).toBeCloseTo(SETTING_START, 0);
        expect(hint.y).toBeGreaterThanOrEqual(words.y + words.height);
        expect(groupBox.y).toBeGreaterThanOrEqual(hint.y + hint.height);
        expect(groupBox.x - sheetBox.x).toBeCloseTo(SETTING_START, 0);
        expect(
          sheetBox.x + sheetBox.width - (groupBox.x + groupBox.width),
        ).toBeCloseTo(SETTING_END, 0);
        await expect(label).toHaveCSS("font-weight", HEADING_WEIGHT);
        await expect(group.getByRole("radio")).toHaveCount(4);
        await expect(group.getByRole("radio").last()).toHaveAccessibleName(
          "Creator",
        );
        await expect(group.locator("svg")).toHaveCount(0);
        await expect(group).toHaveAccessibleDescription(
          /^Creator puts each series under its writer/,
        );
      });

      test("offers Stack series covers as a switch, on until it is turned off", async ({
        page,
      }) => {
        const sheet = await openView(page);
        const stacks = sheet.getByRole("switch", {
          name: /^Stack series covers/,
        });

        await expect(stacks).toBeChecked();
        await stacks.click();

        await expect(stacks).not.toBeChecked();
      });

      test("sets Display with its words at the start and its three options at the end of one row, no icons", async ({
        page,
      }) => {
        const sheet = await openView(page);
        const sheetBox = await boxOf(sheet);
        const words = await boxOf(sheet.getByText("Display", { exact: true }));
        const group = sheet.getByRole("radiogroup", {
          name: "Display",
          exact: true,
        });
        const groupBox = await boxOf(group);

        expect(words.x - sheetBox.x).toBeCloseTo(SETTING_START, 0);
        expect(
          sheetBox.x + sheetBox.width - (groupBox.x + groupBox.width),
        ).toBeCloseTo(SETTING_END, 0);
        expect(groupBox.y).toBeLessThan(words.y + words.height);
        await expect(group.getByRole("radio")).toHaveCount(3);
        await expect(group.locator("svg")).toHaveCount(0);
        await expect(sheet.getByText("Display", { exact: true })).toHaveCSS(
          "font-weight",
          HEADING_WEIGHT,
        );
      });

      test("sets Covers per row with its words at the start and its group at the end of one row", async ({
        page,
      }) => {
        const sheet = await openView(page);
        const sheetBox = await boxOf(sheet);
        const words = await boxOf(
          sheet.getByText("Covers per row", { exact: true }),
        );
        const group = await boxOf(
          sheet.getByRole("radiogroup", { name: "Covers per row" }),
        );

        expect(words.x - sheetBox.x).toBeCloseTo(SETTING_START, 0);
        expect(
          sheetBox.x + sheetBox.width - (group.x + group.width),
        ).toBeCloseTo(SETTING_END, 0);
        expect(group.y).toBeLessThan(words.y + words.height);
      });

      async function rowSetting(sheet: Locator, name: string) {
        const label = sheet.getByText(name, { exact: true });
        const group = sheet.getByRole("radiogroup", { name, exact: true });
        return {
          label,
          group,
          row: label.locator("xpath=.."),
          sheetBox: await boxOf(sheet),
          words: await boxOf(label),
          groupBox: await boxOf(group),
        };
      }

      async function expectAtRowEnd(sheet: Locator, name: string) {
        const { group, sheetBox, words, groupBox } = await rowSetting(
          sheet,
          name,
        );
        const tops = await group
          .getByRole("radio")
          .evaluateAll((radios) =>
            radios.map((radio) => radio.getBoundingClientRect().top),
          );

        expect(words.x - sheetBox.x, name).toBeCloseTo(SETTING_START, 0);
        expect(
          sheetBox.x + sheetBox.width - (groupBox.x + groupBox.width),
          name,
        ).toBeCloseTo(SETTING_END, 0);
        expect(groupBox.y, name).toBeLessThan(words.y + words.height);
        expect(new Set(tops).size, name).toBe(1);
      }

      for (const { width, names } of SIDE_BY_SIDE) {
        test(`keeps ${names.join(" and ")} side by side at the row's end, ${String(width)}px wide`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 844 });

          const sheet = await openView(page);

          for (const name of names) {
            await expectAtRowEnd(sheet, name);
          }
        });
      }

      for (const { textSize, width } of UNDER_ITS_NAME) {
        test(`sets Display's choices under its name across the row when they cannot share its line, ${String(width)}px wide at the ${textSize} text size`, async ({
          page,
        }) => {
          await page.addInitScript((size) => {
            window.localStorage.setItem("omnileaf.textSize", size);
          }, textSize);
          await page.setViewportSize({ width, height: 844 });

          const sheet = await openView(page);
          const { row, words, groupBox } = await rowSetting(sheet, "Display");
          const rowBox = await boxOf(row);

          expect(groupBox.y).toBeGreaterThanOrEqual(words.y + words.height);
          expect(groupBox.x - rowBox.x).toBeCloseTo(SETTING_START, 0);
          expect(
            rowBox.x + rowBox.width - (groupBox.x + groupBox.width),
          ).toBeCloseTo(SETTING_END, 0);
        });
      }

      test("puts Display's and Covers per row's choices back side by side once the sheet has room again", async ({
        page,
      }) => {
        const sheet = await openView(page);
        const { width, height } = page.viewportSize() ?? {
          width: 0,
          height: 0,
        };
        await page.setViewportSize({ width: SQUEEZED_WIDTH, height });
        await framesPassed(page);

        await page.setViewportSize({ width, height });
        await framesPassed(page);

        for (const name of ROW_SETTINGS) {
          await expectAtRowEnd(sheet, name);
        }
      });

      test("pads each row setting 8px above and below, 16px between its name and its choices", async ({
        page,
      }) => {
        const sheet = await openView(page);

        for (const name of ROW_SETTINGS) {
          const { row } = await rowSetting(sheet, name);
          await expect(row).toHaveCSS("padding-top", SETTING_BLOCK_PADDING);
          await expect(row).toHaveCSS("padding-bottom", SETTING_BLOCK_PADDING);
          await expect(row).toHaveCSS("column-gap", SETTING_COLUMN_GAP);
        }
      });

      test("sets Covers per row's helper line 8px under its choices, at the row's start", async ({
        page,
      }) => {
        const sheet = await openView(page);
        const { sheetBox, groupBox } = await rowSetting(
          sheet,
          "Covers per row",
        );

        const helper = await boxOf(
          sheet.getByText(/^Fits as many as the width allows/),
        );

        expect(helper.x - sheetBox.x).toBeCloseTo(SETTING_START, 0);
        expect(helper.y - (groupBox.y + groupBox.height)).toBeCloseTo(
          SETTING_ROW_GAP,
          0,
        );
      });

      test("sets the stepper's range 8px under Covers per row's choices, 16px clear of the stepper", async ({
        page,
      }) => {
        const sheet = await openView(page);
        await sheet.getByRole("radio", { name: "Choose" }).click();
        const { sheetBox, groupBox } = await rowSetting(
          sheet,
          "Covers per row",
        );
        const range = sheet.getByText(/on this phone$/);
        const stepperRow = range.locator("xpath=../..");

        const rangeBox = await boxOf(range);
        const stepperRowBox = await boxOf(stepperRow);

        expect(rangeBox.x - sheetBox.x).toBeCloseTo(SETTING_START, 0);
        expect(stepperRowBox.y - (groupBox.y + groupBox.height)).toBeCloseTo(
          SETTING_ROW_GAP,
          0,
        );
        await expect(stepperRow).toHaveCSS("column-gap", STEPPER_GAP);
      });

      for (const { scale, width } of LARGE_TEXT) {
        test(`moves Display's and Covers per row's choices under their names, across the row, at ${String(scale)}x text and ${String(width)}px`, async ({
          page,
        }) => {
          await setTextScale(page, scale);
          await page.setViewportSize({ width, height: 844 });

          const sheet = await openView(page);

          for (const name of ROW_SETTINGS) {
            const { sheetBox, words, groupBox } = await rowSetting(sheet, name);
            expect(groupBox.y, name).toBeGreaterThanOrEqual(
              words.y + words.height,
            );
            expect(groupBox.x - sheetBox.x, name).toBeCloseTo(SETTING_START, 0);
            expect(
              sheetBox.x + sheetBox.width - (groupBox.x + groupBox.width),
              name,
            ).toBeCloseTo(SETTING_END, 0);
          }
          const choices = await sheet
            .getByRole("radiogroup", { name: "Covers per row" })
            .getByRole("radio")
            .evaluateAll((radios) =>
              radios.map((radio) => radio.getBoundingClientRect().top),
            );
          expect(new Set(choices).size).toBe(1);
        });
      }

      test("draws the Covers per row stepper as two 40px soft-accent circles round a 16px count, at the end of its row", async ({
        page,
      }) => {
        const sheet = await openView(page);
        await sheet.getByRole("radio", { name: "Choose" }).click();
        const group = sheet.getByRole("group", {
          name: "Covers per row, chosen",
        });
        const fewer = group.getByRole("button", {
          name: "Fewer covers per row",
        });
        const more = group.getByRole("button", { name: "More covers per row" });
        const count = group.locator("output");

        const sheetBox = await boxOf(sheet);
        const groupBox = await boxOf(group);
        const fewerBox = await boxOf(fewer);
        const moreBox = await boxOf(more);

        expect(fewerBox.width).toBeCloseTo(40, 0);
        expect(fewerBox.height).toBeCloseTo(40, 0);
        expect(moreBox.x - (fewerBox.x + fewerBox.width)).toBeGreaterThan(8);
        expect(
          sheetBox.x + sheetBox.width - (groupBox.x + groupBox.width),
        ).toBeCloseTo(SETTING_END, 0);
        await expect(fewer).toHaveCSS("border-top-left-radius", "20px");
        await expect(fewer).toHaveCSS(
          "background-color",
          await tokenColour(page, "--native-color-accent-soft"),
        );
        await expect(count).toHaveCSS("font-size", "16px");
        await expect(count).toHaveCSS("line-height", "24px");
        await expect(count).toHaveCSS("font-weight", "500");

        await more.click();
        await expect(more).toBeDisabled();
      });

      test("sets each cover mark as a Material row, padded 16px and 24px, with no rule between", async ({
        page,
      }) => {
        const sheet = await openView(page);
        const row = sheet.getByRole("switch", { name: "Unread count" });

        await expect(row).toHaveCSS("padding-left", "16px");
        await expect(row).toHaveCSS("padding-right", "24px");
        await expect(row.locator("xpath=..")).toHaveCSS(
          "border-top-width",
          "0px",
        );
      });
    });

    test.describe("when the filters leave nothing", () => {
      const leavesNothing = (filter: { tags: readonly string[] }) =>
        filter.tags.length > 0;
      test.use({
        backend: {
          ...backendWith(MANY_CHOICES),
          librarySeries: (
            after: Parameters<ReturnType<typeof pagedSeries>>[0],
            listing: Parameters<ReturnType<typeof pagedSeries>>[1],
          ) =>
            pagedSeries(() => (leavesNothing(listing.filter) ? [] : LIBRARY))(
              after,
              listing,
            ),
          librarySeriesCount: (filter: { tags: readonly string[] }) =>
            leavesNothing(filter) ? 0 : LIBRARY.length,
          libraryListing: () => FILTERED_LISTING,
        },
      });

      test("draws it with a 48px muted icon, a 22px title, a 14px line and an outlined Clear all filters button", async ({
        page,
      }) => {
        await page.goto("/");
        const region = page.getByRole("region", {
          name: "No series match these filters",
        });
        await expect(region).toBeVisible();
        const title = region.getByRole("heading");
        const line = region.getByText("leave nothing", { exact: false });

        await expect(title).toHaveCSS("font-size", "22px");
        await expect(title).toHaveCSS("line-height", "28px");
        await expect(title).toHaveCSS("font-weight", "400");
        await expect(line).toHaveCSS("font-size", "14px");
        await expect(line).toHaveCSS("line-height", "20px");
        expect((await boxOf(region.locator("svg").first())).width).toBeCloseTo(
          48,
          0,
        );
        await expect(
          region.getByRole("button", { name: "Clear all filters" }),
        ).toBeVisible();
      });

      test("sets Clear all filters 16px under its line, as Material's empty state does", async ({
        page,
      }) => {
        await page.goto("/");
        const region = page.getByRole("region", {
          name: "No series match these filters",
        });
        const clear = region.getByRole("button", { name: "Clear all filters" });
        await expect(clear).toBeVisible();

        const [line, button] = await Promise.all([
          boxOf(region.locator('[data-slot="empty-description"]')),
          boxOf(clear),
        ]);

        expect(button.y - (line.y + line.height)).toBe(EMPTY_NOTE_TO_ACTION);
      });
    });

    test.describe("with more settings than fit", () => {
      test.use({ backend: backendWith(MANY_CHOICES) });

      test("rules the foot with the separator colour while settings run on under it", async ({
        page,
      }) => {
        const sheet = await openSheet(page);
        const foot = showButton(sheet).locator("xpath=..");

        await expect(foot).toHaveCSS("border-top-width", SEPARATOR_WIDTH);
        await expect(foot).toHaveCSS(
          "border-top-color",
          await tokenColour(page, "--native-color-sheet-rule"),
        );
      });

      test("drops the divider once scrolled to the end", async ({ page }) => {
        const sheet = await openSheet(page);
        const foot = showButton(sheet).locator("xpath=..");

        await sheet.locator("[data-sheet-body]").evaluate((body) => {
          body.scrollTo({ top: body.scrollHeight });
        });

        await expect(foot).toHaveCSS("border-top-width", "0px");
      });

      for (const colorScheme of ["light", "dark"] as const) {
        test(`has no accessibility violations in the ${colorScheme} theme`, async ({
          page,
        }) => {
          await page.emulateMedia({ colorScheme });
          await openSheet(page);

          expect(await accessibilityViolations(page)).toEqual([]);
        });
      }
    });
  },
);
