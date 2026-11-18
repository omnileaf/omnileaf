import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  LARGEST_TEXT_SCALE,
  setTextScale,
  settle,
  sidewaysOverflow,
  test,
  tokenColour,
} from "./fixtures.ts";

const ROW_INSET = 16;
const DEPTH_STEP = 20;
const ICON_SIZE = 24;
const ICON_GAP = 8;
const RULE_GAP = 12;
const INTRO_TO_CARD = 16;
const CARD_TO_HEADING = 24;
const HEADING_TO_RULES = 8;

const EXAMPLE = [
  ["Comics", "The folder you link", 0],
  ["Sample Series 04 (2019)", "A series, from 2019", 1],
  ["Sample Series 04 v01.cbz", "Volume 1", 2],
  ["Sample Series 04 v02.cbz", "Volume 2", 2],
  ["Volume 03", "Volume 3, made of chapters", 2],
  ["Chapter 017.cbz", "Chapter 17, in Volume 3", 3],
  ["Sample Series 04 c097.cbz", "Chapter 97, after the last volume", 2],
  ["Specials", "Extras", 2],
  ["Summer Short.cbz", "A special", 3],
  ["Author B", "A folder for one writer", 1],
  ["Sample Series 02", "A series", 2],
  ["Sample Series 05.cbz", "A one-shot", 1],
] as const;

test.use({ backend: { ...DEFAULT_BACKEND } });

async function openGuide(page: Page): Promise<void> {
  await page.goto("/settings/library/folders");
  await expect(
    page.getByRole("heading", { name: "How folders are read" }).last(),
  ).toBeVisible();
}

function example(page: Page): Locator {
  return page.getByRole("list", { name: "An example folder" });
}

function intro(page: Page): Locator {
  return page.getByText(/^Omnileaf reads your files where they are/);
}

function rulesHeading(page: Page): Locator {
  return page.getByRole("heading", { name: "What the names mean", level: 2 });
}

async function contentEdgesOf(
  locator: Locator,
): Promise<{ top: number; bottom: number }> {
  return locator.evaluate((element) => {
    const { top, bottom } = element.getBoundingClientRect();
    const { paddingTop, paddingBottom } = getComputedStyle(element);
    return {
      top: top + Number.parseFloat(paddingTop),
      bottom: bottom - Number.parseFloat(paddingBottom),
    };
  });
}

function rowOf(page: Page, name: string): Locator {
  return example(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
}

test.describe(
  "How folders are read on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's folder tree");
    });

    test("draws the example folder as a tree in an outlined card, not a table", async ({
      page,
    }) => {
      await openGuide(page);
      const outline = await tokenColour(page, "--color-border");

      const shadow = await example(page).evaluate(
        (list) => getComputedStyle(list).boxShadow,
      );

      expect(shadow).toContain(`${outline} 0px 0px 0px 1px inset`);
      await expect(example(page)).toHaveCSS("border-top-left-radius", "12px");
      await expect(page.getByRole("table")).toHaveCount(0);
    });

    test("gives each name its own row with what it is read as under it", async ({
      page,
    }) => {
      await openGuide(page);
      const rows = example(page).getByRole("listitem");

      await expect(rows).toHaveCount(EXAMPLE.length);
      for (const [index, [name, reading]] of EXAMPLE.entries()) {
        const row = rows.nth(index);
        const nameBox = await boxOf(row.getByText(name, { exact: true }));
        const readingBox = await boxOf(row.getByText(reading, { exact: true }));

        expect(readingBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height);
        expect(readingBox.x).toBe(nameBox.x);
      }
    });

    test("indents each row 16px, then 20px more for each folder it sits in", async ({
      page,
    }) => {
      await openGuide(page);
      const card = await boxOf(example(page));

      for (const [name, , depth] of EXAMPLE) {
        const row = rowOf(page, name);
        const icon = await boxOf(row.locator("[data-icon]"));
        const text = await boxOf(row.getByText(name, { exact: true }));

        expect(icon.x - card.x).toBeCloseTo(ROW_INSET + depth * DEPTH_STEP, 0);
        expect(icon.width).toBe(ICON_SIZE);
        expect(text.x - icon.x).toBeCloseTo(ICON_SIZE + ICON_GAP, 0);
      }
    });

    test("marks folders with a folder icon in the accent and files with a muted file icon", async ({
      page,
    }) => {
      await openGuide(page);
      const accent = await tokenColour(page, "--text-color-accent");
      const muted = await tokenColour(page, "--color-muted");
      const folder = rowOf(page, "Volume 03").locator("[data-icon]");
      const file = rowOf(page, "Chapter 017.cbz").locator("[data-icon]");

      await expect(folder).toHaveAttribute("data-icon", "folder");
      await expect(folder).toHaveCSS("color", accent);
      await expect(file).toHaveAttribute("data-icon", "file-text");
      await expect(file).toHaveCSS("color", muted);
    });

    test("sets each name in 16px body type over a muted 12px line", async ({
      page,
    }) => {
      await openGuide(page);
      const row = rowOf(page, "Volume 03");
      const name = row.getByText("Volume 03", { exact: true });
      const reading = row.getByText("Volume 3, made of chapters");

      await expect(name).toHaveCSS("font-size", "16px");
      await expect(name).toHaveCSS("line-height", "24px");
      await expect(reading).toHaveCSS("font-size", "12px");
      await expect(reading).toHaveCSS("line-height", "16px");
      await expect(reading).toHaveCSS(
        "color",
        await tokenColour(page, "--color-muted"),
      );
    });

    test("lists the naming rules as plain 14px lines 12px apart", async ({
      page,
    }) => {
      await openGuide(page);
      const rules = page.getByRole("list", { name: "What the names mean" });
      const items = rules.getByRole("listitem");

      await expect(rulesHeading(page)).toBeVisible();
      await expect(items).toHaveCount(7);
      await expect(rules).toHaveCSS("list-style-type", "none");
      await expect(items.first()).toHaveCSS("font-size", "14px");
      await expect(items.first()).toHaveCSS("line-height", "20px");
      const first = await boxOf(items.nth(0));
      const second = await boxOf(items.nth(1));
      expect(second.y - (first.y + first.height)).toBeCloseTo(RULE_GAP, 0);
    });

    test("sets the intro in 16px body type in the text colour, not muted", async ({
      page,
    }) => {
      await openGuide(page);

      await expect(intro(page)).toHaveCSS("font-size", "16px");
      await expect(intro(page)).toHaveCSS("line-height", "24px");
      await expect(intro(page)).toHaveCSS(
        "color",
        await tokenColour(page, "--color-foreground"),
      );
    });

    test("spaces the intro, the example, the rules heading and the rules as drawn", async ({
      page,
    }) => {
      await openGuide(page);
      const introEdges = await contentEdgesOf(intro(page));
      const card = await boxOf(example(page));
      const heading = await contentEdgesOf(rulesHeading(page));
      const firstRule = await boxOf(
        page
          .getByRole("list", { name: "What the names mean" })
          .getByRole("listitem")
          .first(),
      );

      expect(card.y - introEdges.bottom).toBeCloseTo(INTRO_TO_CARD, 0);
      expect(heading.top - (card.y + card.height)).toBeCloseTo(
        CARD_TO_HEADING,
        0,
      );
      expect(firstRule.y - heading.bottom).toBeCloseTo(HEADING_TO_RULES, 0);
    });

    test("keeps the guide inside a small phone at the largest text", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await setTextScale(page, LARGEST_TEXT_SCALE);
      await openGuide(page);
      await expect(example(page)).toBeVisible();
      await settle(page.getByRole("main"));

      expect(await sidewaysOverflow(page)).toEqual([]);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openGuide(page);
        await expect(example(page)).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);

test.describe("How folders are read on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "ios", "the iPhone keeps the table");
  });

  test("keeps the example folder as a table", async ({ page }) => {
    await openGuide(page);

    await expect(
      page.getByRole("table", { name: "An example folder" }),
    ).toBeVisible();
    await expect(example(page)).toHaveCount(0);
  });
});
