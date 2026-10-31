import type { Locator, Page } from "@playwright/test";

import type { LibraryFilterChoices } from "../../src/lib/ipc/bindings.ts";
import { NEW_LIBRARY_LISTING } from "../../src/lib/library/library-listing.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  settle,
  test,
  tokenColour,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

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
        await expect(chip.locator("svg")).toHaveCount(1);
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

      for (const name of ["Display", "Group by"]) {
        test(`sets ${name} with its words over a group the width of the row, no icons`, async ({
          page,
        }) => {
          const sheet = await openView(page);
          const sheetBox = await boxOf(sheet);
          const words = await boxOf(sheet.getByText(name, { exact: true }));
          const group = sheet.getByRole("radiogroup", { name, exact: true });
          const groupBox = await boxOf(group);

          expect(words.x - sheetBox.x).toBeCloseTo(SETTING_START, 0);
          expect(groupBox.x - sheetBox.x).toBeCloseTo(SETTING_START, 0);
          expect(
            sheetBox.x + sheetBox.width - (groupBox.x + groupBox.width),
          ).toBeCloseTo(SETTING_END, 0);
          expect(groupBox.y).toBeGreaterThanOrEqual(words.y + words.height);
          await expect(group.locator("svg")).toHaveCount(0);
          await expect(sheet.getByText(name, { exact: true })).toHaveCSS(
            "font-weight",
            HEADING_WEIGHT,
          );
        });
      }

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
        await expect(fewer).toHaveCSS(
          "border-top-left-radius",
          "3.35544e+07px",
        );
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
