import type { Locator, Page } from "@playwright/test";

import type { LibraryCategory, Platform } from "../../src/lib/ipc/bindings.ts";

import {
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  settle,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { openViewOptions as openFromBar } from "./view-options.ts";

const SERIES_IN_LIBRARY = 6;
const SUBHEAD_SIZE = "15px";
const SUBHEAD_LINE = "20px";
const FOOTNOTE_SIZE = "13px";
const FIELD_GAP = 8;
const SECTION_GAP = 14;
const CONTENT_INSET = 16;
const ROW_HEIGHT = 52;
const IPHONE_ROW_HEIGHT = 56;
const IPHONE_FIELD_GAP = 12;
const ROW_WITH_SUBTITLE_HEIGHT = 72;
const POPOVER_WIDTH = 360;
const LARGE_TEXT_SCALE = 2;
const EDGE_TOLERANCE_PX = 1;
const CATEGORIES = [
  { id: "manga", name: "Manga" },
  { id: "comics", name: "Comics" },
] as LibraryCategory[];
const CATEGORY_TABS_HINT = "Your categories as tabs above the library.";
const FIT_WIDTH_NOTE = /^Fits as many as the width allows/;
const GROUP_BY_NOTE = /^Creator puts each series/;

function backendOn(platform: Platform) {
  return {
    ...onPlatform(platform).backend,
    librarySeries: pagedSeries(() => sampleSeries(SERIES_IN_LIBRARY)),
    librarySeriesCount: () => SERIES_IN_LIBRARY,
    libraryCategories: () => [...CATEGORIES],
  };
}

async function openViewOptions(page: Page): Promise<Locator> {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(SERIES_IN_LIBRARY);
  await page.getByRole("button", { name: "More for the library" }).click();
  await page.getByRole("menuitem", { name: "View options" }).click();
  const popover = page.getByRole("dialog", { name: "View options" });
  await expect(popover).toBeVisible();
  await settle(popover);
  return popover;
}

function label(popover: Locator, name: string): Locator {
  return popover.getByText(name, { exact: true });
}

function control(popover: Locator, name: string): Locator {
  return popover.getByRole("radiogroup", { name });
}

async function bottomOf(locator: Locator): Promise<number> {
  const box = await boxOf(locator);
  return box.y + box.height;
}

test.describe("The iPad's View options controls", () => {
  testOnlyInItsWebview("ios");
  test.skip(({ hasTouch }) => !hasTouch, "an iPad has a touch screen");
  test.use({ backend: backendOn("ios") });

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "iPads only");
  });

  test("sets the Display, Covers per row and Group by labels in subhead type, 8px above their controls", async ({
    page,
  }) => {
    const popover = await openViewOptions(page);

    for (const name of ["Display", "Covers per row", "Group by"]) {
      const words = label(popover, name);
      await expect(words).toHaveCSS("font-size", SUBHEAD_SIZE);
      await expect(words).toHaveCSS("line-height", SUBHEAD_LINE);
      const gap =
        (await boxOf(control(popover, name))).y - (await bottomOf(words));
      expect(gap).toBe(FIELD_GAP);
    }
  });

  test("stacks the Covers per row control under its label across the popover", async ({
    page,
  }) => {
    const popover = await openViewOptions(page);

    const words = await boxOf(label(popover, "Covers per row"));
    const choices = await boxOf(control(popover, "Covers per row"));
    const display = await boxOf(control(popover, "Display"));

    expect(choices.x).toBe(words.x);
    expect(choices.width).toBe(display.width);
    expect(choices.y).toBeGreaterThanOrEqual(words.y + words.height);
  });

  test("draws Display as words only and keeps its Covers option", async ({
    page,
  }) => {
    const popover = await openViewOptions(page);
    const display = control(popover, "Display");

    for (const name of ["Grid", "Compact", "Covers", "List"]) {
      await expect(display.getByRole("radio", { name })).toBeVisible();
    }
    await expect(display.locator("svg")).toHaveCount(0);
  });

  test("stacks the Layout sections 14px apart with no dividers between them", async ({
    page,
  }) => {
    const popover = await openViewOptions(page);

    const afterDisplay = await bottomOf(control(popover, "Display"));
    const afterFootnote = await bottomOf(popover.getByText(FIT_WIDTH_NOTE));
    const coversTop = (await boxOf(label(popover, "Covers per row"))).y;
    const groupByTop = (await boxOf(label(popover, "Group by"))).y;
    expect(coversTop - afterDisplay).toBe(SECTION_GAP);
    expect(groupByTop - afterFootnote).toBe(SECTION_GAP);
    const ruled = await popover
      .getByRole("region", { name: "Layout" })
      .evaluate(
        (layout) =>
          [layout, ...layout.querySelectorAll("*")].filter((element) => {
            const style = getComputedStyle(element);
            return (
              style.borderTopWidth !== "0px" ||
              style.borderBottomWidth !== "0px"
            );
          }).length,
      );
    expect(ruled).toBe(0);
  });

  test("sets the fits-the-width footnote as 13px muted text between its control and the next section", async ({
    page,
  }) => {
    const popover = await openViewOptions(page);
    const footnote = popover.getByText(FIT_WIDTH_NOTE);

    await expect(footnote).toHaveCSS("font-size", FOOTNOTE_SIZE);
    await expect(footnote).toHaveCSS(
      "color",
      await tokenColour(page, "--secondary-text"),
    );
    const note = await boxOf(footnote);
    const controlBottom = await bottomOf(control(popover, "Covers per row"));
    expect(note.y - controlBottom).toBe(FIELD_GAP);
    expect(note.y + note.height).toBeLessThanOrEqual(
      (await boxOf(label(popover, "Group by"))).y,
    );
  });

  test("keeps the Group by hint inside the popover in the same footnote type", async ({
    page,
  }) => {
    const popover = await openViewOptions(page);
    const hint = popover.getByText(GROUP_BY_NOTE);

    await expect(hint).toHaveCSS("font-size", FOOTNOTE_SIZE);
    const box = await boxOf(hint);
    const panel = await boxOf(popover);
    expect(box.x).toBe(panel.x + CONTENT_INSET);
    expect(box.x + box.width).toBeLessThanOrEqual(
      panel.x + panel.width - CONTENT_INSET + EDGE_TOLERANCE_PX,
    );
    expect(box.y - (await bottomOf(control(popover, "Group by")))).toBe(
      FIELD_GAP,
    );
  });

  test("draws the Show on covers switches as plain 52px rows with no plate", async ({
    page,
  }) => {
    const popover = await openViewOptions(page);
    const list = popover.getByRole("group", { name: "Show on covers" });

    for (const name of [
      "Unread count",
      "Language",
      "Continue reading button",
    ]) {
      const row = list.getByRole("switch", { name });
      expect((await boxOf(row)).height).toBe(ROW_HEIGHT);
      const title = await boxOf(row.getByText(name, { exact: true }));
      expect(title.x - (await boxOf(popover)).x).toBe(CONTENT_INSET);
      await expect(row.getByText(name, { exact: true })).toHaveCSS(
        "font-size",
        "17px",
      );
    }
    const rows = list.getByRole("switch").first().locator("..");
    await expect(rows).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(rows).toHaveCSS("border-radius", "0px");
  });

  test("draws Category tabs as a 72px row with a subhead subtitle", async ({
    page,
  }) => {
    const popover = await openViewOptions(page);
    const row = popover.getByRole("switch", { name: "Category tabs" });

    expect((await boxOf(row)).height).toBeGreaterThanOrEqual(
      ROW_WITH_SUBTITLE_HEIGHT,
    );
    await expect(row.getByText(CATEGORY_TABS_HINT)).toHaveCSS(
      "font-size",
      SUBHEAD_SIZE,
    );
    await expect(row.getByText("Category tabs", { exact: true })).toHaveCSS(
      "font-size",
      "17px",
    );
  });

  test("grows the popover with large text and keeps every control inside it", async ({
    page,
  }) => {
    const popover = await openViewOptions(page);
    const before = await boxOf(popover);

    await page.evaluate((scale) => {
      document.documentElement.style.setProperty("--text-scale", String(scale));
    }, LARGE_TEXT_SCALE);

    await expect
      .poll(async () => (await boxOf(popover)).height)
      .toBeGreaterThan(before.height);
    const words = await boxOf(label(popover, "Covers per row"));
    const choices = await boxOf(control(popover, "Covers per row"));
    expect(choices.y).toBeGreaterThanOrEqual(words.y + words.height);
    expect((await boxOf(popover)).width).toBe(POPOVER_WIDTH);
    const sideways = await popover.evaluate(
      (panel) => panel.scrollWidth - panel.clientWidth,
    );
    expect(sideways).toBeLessThanOrEqual(0);
    expect(
      await bottomOf(popover.getByText(FIT_WIDTH_NOTE)),
    ).toBeLessThanOrEqual((await boxOf(label(popover, "Group by"))).y);
  });
});

test.describe("The View options controls on an iPad-sized screen of another platform", () => {
  test.skip(({ hasTouch }) => !hasTouch, "a tablet has a touch screen");
  test.use({ backend: backendOn("windows") });

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "tablets only");
  });

  test("keeps Covers per row beside its label and the icons in Display", async ({
    page,
  }) => {
    await page.goto("/");
    const popover = await openFromBar(page);

    const words = await boxOf(label(popover, "Covers per row"));
    const choices = await boxOf(control(popover, "Covers per row"));
    expect(choices.x).toBeGreaterThan(words.x + words.width);
    await expect(
      control(popover, "Display").locator("svg").first(),
    ).toBeVisible();
  });
});

test.describe("The iPhone's View options sheet", () => {
  testOnlyInItsWebview("ios");
  test.use({ backend: backendOn("ios") });

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "iPhones only");
  });

  test("keeps Covers per row 12px under its label and its 56px switch rows", async ({
    page,
  }) => {
    await page.goto("/");
    const sheet = await openFromBar(page);

    const words = label(sheet, "Covers per row");
    const gap =
      (await boxOf(control(sheet, "Covers per row"))).y -
      (await bottomOf(words));
    expect(gap).toBe(IPHONE_FIELD_GAP);
    const row = sheet.getByRole("switch", { name: "Unread count" });
    expect((await boxOf(row)).height).toBe(IPHONE_ROW_HEIGHT);
    await expect(control(sheet, "Display").locator("svg")).toHaveCount(0);
  });
});
