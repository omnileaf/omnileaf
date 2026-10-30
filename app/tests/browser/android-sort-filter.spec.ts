import type { Locator, Page } from "@playwright/test";

import type { LibraryFilterChoices } from "../../src/lib/ipc/bindings.ts";
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
