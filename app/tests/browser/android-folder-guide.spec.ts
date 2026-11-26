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
  viewportOf,
} from "./fixtures.ts";

const BAR_BACK_START = 8;
const BAR_TITLE_START = 52;
const CARD_INSET = 32;
const DEPTH_STEP = 20;
const ICON_SIZE = 24;
const ICON_GAP = 8;
const CARD_TO_FIRST_ROW = 24;
const NAME_LINE = 26;
const INTRO_TO_CARD = 16;
const CARD_TO_HEADING = 24;
const HEADING_TO_GROUP_HEADING = 24;
const GROUP_HEADING_TO_ROWS = 8;
const ROW_START = 16;
const ROW_TEXT_START = 56;
const TWO_LINE_ROW = 72;
const THREE_LINE_PADDING = 12;
const MONOSPACE = /monospace/;

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

const FOLDER_RULES = [
  "Series",
  "Volume made of chapters",
  "Specials",
  "Folders above a series",
] as const;

const FILE_RULES = [
  "Volume",
  "Chapter",
  "One-shot",
  "Other names",
  "Details inside a file",
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

function rules(page: Page, group: "Folders" | "Files"): Locator {
  return page.getByRole("list", { name: group, exact: true });
}

function rule(page: Page, group: "Folders" | "Files", title: string): Locator {
  return rules(page, group)
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) });
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

    test("titles the page in the top bar beside the back arrow, with no large title under it", async ({
      page,
    }) => {
      await openGuide(page);
      const bar = page.locator("[data-title-bar]");
      const title = bar.getByRole("heading", {
        name: "How folders are read",
        level: 1,
      });
      const back = await boxOf(
        bar.getByRole("link", { name: "Back to Library" }),
      );
      const titleBox = await boxOf(title);

      await expect(title).toBeVisible();
      await expect(title).toHaveCSS("font-size", "22px");
      await expect(
        page.getByRole("heading", { name: "How folders are read" }),
      ).toHaveCount(1);
      expect(back.x).toBeCloseTo(BAR_BACK_START, 0);
      expect(titleBox.x).toBeCloseTo(BAR_TITLE_START, 0);
      expect(titleBox.y + titleBox.height / 2).toBeCloseTo(
        back.y + back.height / 2,
        0,
      );
    });

    test("puts the intro straight under the top bar", async ({ page }) => {
      await openGuide(page);
      const bar = await boxOf(page.locator("[data-title-bar]"));
      const introBox = await boxOf(intro(page));

      expect(introBox.y).toBeCloseTo(bar.y + bar.height, 0);
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

    test("indents each row 32px inside the card, then 20px more for each folder it sits in", async ({
      page,
    }) => {
      await openGuide(page);
      const card = await boxOf(example(page));

      for (const [name, , depth] of EXAMPLE) {
        const row = rowOf(page, name);
        const icon = await boxOf(row.locator("[data-icon]"));
        const text = await boxOf(row.getByText(name, { exact: true }));

        expect(icon.x - card.x).toBeCloseTo(CARD_INSET + depth * DEPTH_STEP, 0);
        expect(icon.width).toBe(ICON_SIZE);
        expect(text.x - icon.x).toBeCloseTo(ICON_SIZE + ICON_GAP, 0);
      }
    });

    test("starts the first row 24px inside the card and puts each reading 26px under its row's top, below the icon", async ({
      page,
    }) => {
      await openGuide(page);
      const card = await boxOf(example(page));
      const first = rowOf(page, "Comics");
      const row = await boxOf(first);
      const content = await contentEdgesOf(first);
      const reading = await boxOf(
        first.getByText("The folder you link", { exact: true }),
      );

      expect(row.y - card.y).toBeCloseTo(CARD_TO_FIRST_ROW, 0);
      expect(reading.y - content.top).toBeCloseTo(NAME_LINE, 0);
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

    test("lists the naming rules under Folders, then Files, one row per rule", async ({
      page,
    }) => {
      await openGuide(page);
      const folders = await boxOf(rules(page, "Folders"));
      const files = await boxOf(rules(page, "Files"));

      await expect(
        rules(page, "Folders")
          .getByRole("listitem")
          .locator("[data-slot=item-title]"),
      ).toHaveText([...FOLDER_RULES]);
      await expect(
        rules(page, "Files")
          .getByRole("listitem")
          .locator("[data-slot=item-title]"),
      ).toHaveText([...FILE_RULES]);
      expect(files.y).toBeGreaterThan(folders.y + folders.height - 1);
    });

    test("leads each rule with the tree's icons: an accent folder under Folders, a muted file under Files", async ({
      page,
    }) => {
      await openGuide(page);
      const accent = await tokenColour(page, "--text-color-accent");
      const muted = await tokenColour(page, "--color-muted");
      const folderIcons = rules(page, "Folders").locator("[data-icon]");
      const fileIcons = rules(page, "Files").locator("[data-icon]");

      await expect(folderIcons).toHaveCount(FOLDER_RULES.length);
      await expect(fileIcons).toHaveCount(FILE_RULES.length);
      for (const icon of await folderIcons.all()) {
        await expect(icon).toHaveAttribute("data-icon", "folder");
        await expect(icon).toHaveCSS("color", accent);
      }
      for (const icon of await fileIcons.all()) {
        await expect(icon).toHaveAttribute("data-icon", "file-text");
        await expect(icon).toHaveCSS("color", muted);
      }
    });

    test("puts a rule's example names in monospace under its headline, then its sentence in plain type", async ({
      page,
    }) => {
      await openGuide(page);
      const series = rule(page, "Folders", "Series");
      const title = series.getByText("Series", { exact: true });
      const names = series.locator("code");
      const sentence = series.getByText(
        "Named after the folder; a year in brackets is its year.",
      );
      const muted = await tokenColour(page, "--color-muted");

      await expect(names).toHaveText("Sample Series 04 (2019)");
      await expect(title).toHaveCSS("font-size", "16px");
      await expect(title).toHaveCSS("line-height", "24px");
      await expect(names).toHaveCSS("font-family", MONOSPACE);
      await expect(names).toHaveCSS("font-size", "14px");
      await expect(names).toHaveCSS("line-height", "20px");
      await expect(names).toHaveCSS("color", muted);
      await expect(sentence).not.toHaveCSS("font-family", MONOSPACE);
      await expect(sentence).toHaveCSS("font-size", "14px");
      await expect(sentence).toHaveCSS("color", muted);
      const titleBox = await boxOf(title);
      const namesBox = await boxOf(names);
      const sentenceBox = await boxOf(sentence);
      expect(namesBox.y).toBeGreaterThanOrEqual(
        titleBox.y + titleBox.height - 1,
      );
      expect(sentenceBox.y).toBeGreaterThanOrEqual(
        namesBox.y + namesBox.height - 1,
      );
    });

    test("gives each example name its own code, the middle dots between them hidden from screen readers", async ({
      page,
    }) => {
      await openGuide(page);
      const volume = rule(page, "Files", "Volume");

      await expect(volume.locator("code")).toHaveText([
        "Volume 1",
        "Vol. 01",
        "v01",
      ]);
      await expect(volume.locator("[data-slot=item-description]")).toHaveText(
        /^\s*Volume 1·? Vol\. 01·? v01\s*$/,
      );
      await expect(volume.getByText("·", { exact: true })).toHaveCount(2);
      for (const dot of await volume.getByText("·", { exact: true }).all()) {
        await expect(dot).toHaveAttribute("aria-hidden", "true");
      }
      await expect(rule(page, "Files", "Chapter").locator("code")).toHaveText([
        "Chapter 12",
        "Ch. 12",
        "c012",
      ]);
      await expect(
        rule(page, "Files", "Details inside a file").locator("code"),
      ).toHaveText("ComicInfo.xml");
      await expect(rule(page, "Files", "One-shot").locator("code")).toHaveCount(
        0,
      );
    });

    test("runs each rule row edge to edge with its icon 16px in and its words 56px in", async ({
      page,
    }) => {
      await openGuide(page);
      const row = rule(page, "Files", "Volume");
      const box = await boxOf(row);
      const icon = await boxOf(row.locator("[data-icon]"));
      const title = await boxOf(row.getByText("Volume", { exact: true }));

      expect(box.x).toBe(0);
      expect(box.width).toBe(viewportOf(page).width);
      expect(icon.x).toBeCloseTo(ROW_START, 0);
      expect(icon.width).toBe(ICON_SIZE);
      expect(title.x).toBeCloseTo(ROW_TEXT_START, 0);
    });

    test("draws a two-line rule 72px tall with its icon centred", async ({
      page,
    }) => {
      await openGuide(page);
      const row = rule(page, "Files", "Other names");
      const box = await boxOf(row);
      const icon = await boxOf(row.locator("[data-icon]"));

      expect(box.height).toBeCloseTo(TWO_LINE_ROW, 0);
      expect(icon.y + icon.height / 2).toBeCloseTo(box.y + box.height / 2, 0);
    });

    test("draws a rule with names and a sentence as a three-line row, 12px in, its icon at the top", async ({
      page,
    }) => {
      await openGuide(page);
      const row = rule(page, "Files", "Details inside a file");
      const box = await boxOf(row);
      const icon = await boxOf(row.locator("[data-icon]"));
      const title = await boxOf(
        row.getByText("Details inside a file", { exact: true }),
      );
      const sentence = await boxOf(row.getByText("Come before any name."));

      expect(icon.y - box.y).toBeCloseTo(THREE_LINE_PADDING, 0);
      expect(title.y - box.y).toBeCloseTo(THREE_LINE_PADDING, 0);
      expect(box.y + box.height - (sentence.y + sentence.height)).toBeCloseTo(
        THREE_LINE_PADDING,
        0,
      );
    });

    test("heads the rules in 16px medium type and each group in the accent at 14px", async ({
      page,
    }) => {
      await openGuide(page);
      const folders = page.getByRole("heading", { name: "Folders", level: 3 });
      const files = page.getByRole("heading", { name: "Files", level: 3 });
      const accent = await tokenColour(page, "--text-color-accent");

      await expect(rulesHeading(page)).toHaveCSS("font-size", "16px");
      await expect(rulesHeading(page)).toHaveCSS("line-height", "24px");
      await expect(rulesHeading(page)).toHaveCSS("font-weight", "500");
      for (const heading of [folders, files]) {
        await expect(heading).toHaveCSS("font-size", "14px");
        await expect(heading).toHaveCSS("font-weight", "500");
        await expect(heading).toHaveCSS("color", accent);
      }
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

    test("spaces the intro, the example, the rules heading, the group heading and its rules as drawn", async ({
      page,
    }) => {
      await openGuide(page);
      const introEdges = await contentEdgesOf(intro(page));
      const card = await boxOf(example(page));
      const heading = await contentEdgesOf(rulesHeading(page));
      const groupHeading = await contentEdgesOf(
        page.getByRole("heading", { name: "Folders", level: 3 }),
      );
      const firstRule = await boxOf(
        rules(page, "Folders").getByRole("listitem").first(),
      );

      expect(card.y - introEdges.bottom).toBeCloseTo(INTRO_TO_CARD, 0);
      expect(heading.top - (card.y + card.height)).toBeCloseTo(
        CARD_TO_HEADING,
        0,
      );
      expect(groupHeading.top - heading.bottom).toBeCloseTo(
        HEADING_TO_GROUP_HEADING,
        0,
      );
      expect(firstRule.y - groupHeading.bottom).toBeCloseTo(
        GROUP_HEADING_TO_ROWS,
        0,
      );
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
