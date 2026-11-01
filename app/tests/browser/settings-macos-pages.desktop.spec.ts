import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  expect,
  literalColour,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";

const WINDOW = { width: 1280, height: 800 };
const PAGE_WIDEST = 640;
const GROUP_GAP = 16;
const HEADING_TO_GROUP = 4;
const PLATE_RADIUS = "12px";
const PLATE_INSET = "10px";
const PLATE_BLOCK = "12px";
const ROW_GAP = "10px";
const MARK_SIZE = 16;
const MARK_TO_WORDS = "6px";
const DOT_SIZE = 4.8;
const TITLE_TYPE = { fontSize: "13px", fontWeight: "510", lineHeight: "16px" };
const SUB_TYPE = { fontSize: "11px", lineHeight: "14px" };
const HEADING_TYPE = {
  fontSize: "11px",
  fontWeight: "590",
  lineHeight: "14px",
};

function section(page: Page, name: string): Locator {
  return page.getByRole("region", { name });
}

function group(page: Page, name: string): Locator {
  return page.getByRole("radiogroup", { name });
}

function nextGroup(group: Locator): Locator {
  return group.locator("xpath=following-sibling::*[1]");
}

function markOf(radio: Locator): Locator {
  return radio.locator("[data-radio-mark]");
}

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

test.describe("a group of radio buttons on the General page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/general");
    await expect(group(page, "Omnileaf opens on")).toBeVisible();
  });

  test("sits in a rounded plate inset 10px with 12px above and below its rows", async ({
    page,
  }) => {
    const plate = group(page, "Omnileaf opens on");

    await expect(plate).toHaveCSS("border-radius", PLATE_RADIUS);
    await expect(plate).toHaveCSS("padding-left", PLATE_INSET);
    await expect(plate).toHaveCSS("padding-top", PLATE_BLOCK);
    await expect(plate).toHaveCSS("padding-bottom", PLATE_BLOCK);
    await expect(plate).toHaveCSS("row-gap", ROW_GAP);
    await expect(plate).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-group"),
    );
    await expect(section(page, "Omnileaf opens on")).toHaveCSS(
      "border-top-width",
      "0px",
    );
  });

  test("puts its heading above the plate in 11px 590 type", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { name: "Omnileaf opens on" });
    const above = await boxOf(heading);
    const plate = await boxOf(group(page, "Omnileaf opens on"));

    await expect(heading).toHaveCSS("font-size", HEADING_TYPE.fontSize);
    await expect(heading).toHaveCSS("font-weight", HEADING_TYPE.fontWeight);
    await expect(heading).toHaveCSS("line-height", HEADING_TYPE.lineHeight);
    await expect(heading).toHaveCSS("padding-left", "8px");
    expect(plate.y - (above.y + above.height)).toBe(HEADING_TO_GROUP);
  });

  test("hugs each row to its words instead of stretching it", async ({
    page,
  }) => {
    const plate = await boxOf(group(page, "Omnileaf opens on"));
    const row = await boxOf(
      group(page, "Omnileaf opens on").getByRole("radio", { name: "Library" }),
    );

    expect(row.width).toBeLessThan(plate.width / 2);
  });

  test("draws the unchosen mark 16px with a white field and a rim", async ({
    page,
  }) => {
    const mark = markOf(page.getByRole("radio", { name: "History" }));

    expect((await boxOf(mark)).width).toBe(MARK_SIZE);
    expect((await boxOf(mark)).height).toBe(MARK_SIZE);
    await expect(mark).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-radio-field"),
    );
    await expect(mark).toHaveCSS("border-top-width", "0px");
    await expect(mark).toHaveCSS(
      "box-shadow",
      /rgba\(0, 0, 0, 0\.05\) 0px 0px 0px 1px inset/,
    );
  });

  test("fills the chosen mark with the accent and a 4.8px dot", async ({
    page,
  }) => {
    const mark = markOf(page.getByRole("radio", { name: "Library" }));

    await expect(mark).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-accent"),
    );
    await expect(mark).toHaveCSS("box-shadow", "none");
    const dot = await boxOf(mark.locator("span"));
    expect(dot.width).toBeCloseTo(DOT_SIZE, 1);
    await expect(mark.locator("span")).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-on-accent"),
    );
  });

  test("sets a row's words 6px after the mark in 13px 510 type", async ({
    page,
  }) => {
    const radio = page.getByRole("radio", { name: "Library" });

    await expect(radio).toHaveCSS("column-gap", MARK_TO_WORDS);
    await expect(radio).toHaveCSS("font-size", TITLE_TYPE.fontSize);
    await expect(radio).toHaveCSS("font-weight", TITLE_TYPE.fontWeight);
    await expect(radio).toHaveCSS("line-height", TITLE_TYPE.lineHeight);
  });
});

test.describe("a radio button with a line under it on the 18+ content page", () => {
  test("sets the line in 11px muted type", async ({ page }) => {
    await page.goto("/settings/library/adult-content");
    const hint = page.getByText("Covers stay blurred until clicked.");

    await expect(hint).toHaveCSS("font-size", SUB_TYPE.fontSize);
    await expect(hint).toHaveCSS("line-height", SUB_TYPE.lineHeight);
    await expect(hint).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
  });
});

test("leaves the General page's radio buttons without lines under them", async ({
  page,
}) => {
  await page.goto("/settings/general");

  await expect(group(page, "Omnileaf opens on")).toBeVisible();
  await expect(page.getByText("The reader, where you left it")).toHaveCount(0);
});

test.describe("the 18+ content page's lead line", () => {
  test("sits in 13px muted type 16px above the radio group", async ({
    page,
  }) => {
    await page.goto("/settings/library/adult-content");
    const lead = page.getByText("A series counts as 18+");
    const above = await boxOf(lead);
    const below = await boxOf(section(page, "18+ content"));

    await expect(lead).toHaveCSS("font-size", TITLE_TYPE.fontSize);
    await expect(lead).toHaveCSS("line-height", TITLE_TYPE.lineHeight);
    await expect(lead).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
    expect(below.y - (above.y + above.height)).toBe(GROUP_GAP);
  });
});

test.describe("the page's groups", () => {
  test("stop at 640px wide", async ({ page }) => {
    await page.goto("/settings/general");

    expect((await boxOf(section(page, "Omnileaf opens on"))).width).toBe(
      PAGE_WIDEST,
    );
  });

  test("sit 16px apart", async ({ page }) => {
    await page.goto("/settings/general");
    const first = await boxOf(section(page, "Omnileaf opens on"));
    const second = await boxOf(nextGroup(section(page, "Omnileaf opens on")));

    expect(second.y - (first.y + first.height)).toBe(GROUP_GAP);
  });
});

test.describe("on Windows", () => {
  test.use({ platform: "windows", viewport: { width: 1600, height: 900 } });

  test("keeps the radio group's card, its 720px width and 20px gaps", async ({
    page,
  }) => {
    await page.goto("/settings/general");
    const first = await boxOf(section(page, "Omnileaf opens on"));
    const second = await boxOf(nextGroup(section(page, "Omnileaf opens on")));

    await expect(section(page, "Omnileaf opens on")).toHaveCSS(
      "border-top-width",
      "1px",
    );
    expect(first.width).toBe(720);
    expect(second.y - (first.y + first.height)).toBe(20);
    await expect(
      markOf(page.getByRole("radio", { name: "History" })),
    ).toHaveCSS("border-top-width", "1px");
    await expect(group(page, "Omnileaf opens on")).toHaveCSS(
      "background-color",
      await literalColour(page, "rgba(0, 0, 0, 0)"),
    );
  });
});
