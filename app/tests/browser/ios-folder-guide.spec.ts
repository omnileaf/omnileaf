import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  LARGEST_TEXT_SCALE,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  setTextScale,
  settle,
  sidewaysOverflow,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";

const GROUP_RADIUS = "26px";
const TEXT_INSET = 16;
const ROW_LEAD = 30;
const ROW_GAP = 12;
const ROW_START = 16;
const RULE_INDENT = ROW_START + ROW_LEAD + ROW_GAP;
const TWO_LINE_ROW = 72;
const TREE_ICON = 18;
const TREE_ICON_COLUMN = 22;
const TREE_GAP = 8;
const MONOSPACE = /monospace/;

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

function rules(page: Page, group: "Folders" | "Files"): Locator {
  return page.getByRole("list", { name: group, exact: true });
}

function rule(page: Page, group: "Folders" | "Files", title: string): Locator {
  return rules(page, group)
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) });
}

function treeRow(page: Page, name: string): Locator {
  return example(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
}

async function ruleStartOf(row: Locator): Promise<number> {
  return row.evaluate((element) => {
    const rule = getComputedStyle(element, "::after");
    return Number.parseFloat(rule.insetInlineStart);
  });
}

async function textStartOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const words = document.createRange();
    words.selectNodeContents(element);
    return words.getBoundingClientRect().x;
  });
}

async function expectGroupedPlate(page: Page, plate: Locator): Promise<void> {
  await expect(plate).toHaveCSS(
    "background-color",
    await tokenColour(page, "--native-color-group"),
  );
  await expect(plate).toHaveCSS("border-top-left-radius", GROUP_RADIUS);
}

function describeTheGroupedGuide(): void {
  test("sets the guide on the grouped ground, the example folder in a rounded group, not a table", async ({
    page,
  }) => {
    await openGuide(page);

    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(example(page).getByRole("listitem")).toHaveCount(12);
    await expectGroupedPlate(page, example(page));
    await expect(page.locator("[data-ground=grouped]").first()).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-grouped-ground"),
    );
  });

  test("draws each tree icon at 18pt in a 22pt column, with the name 8pt after it", async ({
    page,
  }) => {
    await openGuide(page);
    const row = treeRow(page, "Volume 03");
    const icon = await boxOf(row.locator("[data-icon]"));
    const name = await boxOf(row.getByText("Volume 03", { exact: true }));

    expect(icon.width).toBe(TREE_ICON);
    expect(name.x - icon.x).toBeCloseTo(TREE_ICON_COLUMN + TREE_GAP, 0);
  });

  test("insets the intro and the rules heading 16pt more than the groups", async ({
    page,
  }) => {
    await openGuide(page);
    const tree = await boxOf(example(page));
    const introStart = await textStartOf(intro(page));
    const headingStart = await textStartOf(
      page.getByRole("heading", { name: "What the names mean", level: 2 }),
    );

    expect(introStart - tree.x).toBeCloseTo(TEXT_INSET, 0);
    expect(headingStart - tree.x).toBeCloseTo(TEXT_INSET, 0);
    await expect(intro(page)).toHaveCSS("font-size", "17px");
    await expect(intro(page)).toHaveCSS(
      "color",
      await tokenColour(page, "--color-foreground"),
    );
  });

  test("lists the naming rules in rounded groups under Folders, then Files", async ({
    page,
  }) => {
    await openGuide(page);

    await expect(
      rules(page, "Folders").locator("[data-slot=item-title]"),
    ).toHaveText([...FOLDER_RULES]);
    await expect(
      rules(page, "Files").locator("[data-slot=item-title]"),
    ).toHaveText([...FILE_RULES]);
    await expectGroupedPlate(page, rules(page, "Folders"));
    await expectGroupedPlate(page, rules(page, "Files"));
  });

  test("heads each group in muted 17pt semibold type, 16pt inside its group", async ({
    page,
  }) => {
    await openGuide(page);
    const heading = page.getByRole("heading", { name: "Files", level: 3 });
    const headingStart = await textStartOf(heading);
    const group = await boxOf(rules(page, "Files"));

    await expect(heading).toHaveCSS("font-size", "17px");
    await expect(heading).toHaveCSS("font-weight", "590");
    await expect(heading).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
    expect(headingStart - group.x).toBeCloseTo(TEXT_INSET, 0);
  });

  test("leads each rule with a 30pt icon column: accent folders, muted files", async ({
    page,
  }) => {
    await openGuide(page);
    const folder = rule(page, "Folders", "Specials");
    const file = rule(page, "Files", "Chapter");
    const group = await boxOf(rules(page, "Files"));
    const lead = await boxOf(file.locator("[data-slot=item-media]"));
    const title = await boxOf(file.getByText("Chapter", { exact: true }));

    await expect(folder.locator("[data-icon]")).toHaveAttribute(
      "data-icon",
      "folder",
    );
    await expect(folder.locator("[data-slot=item-media]")).toHaveCSS(
      "color",
      await tokenColour(page, "--text-color-accent"),
    );
    await expect(file.locator("[data-icon]")).toHaveAttribute(
      "data-icon",
      "file-text",
    );
    await expect(file.locator("[data-slot=item-media]")).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
    expect(lead.x - group.x).toBeCloseTo(ROW_START, 0);
    expect(lead.width).toBe(ROW_LEAD);
    expect(title.x - group.x).toBeCloseTo(RULE_INDENT, 0);
  });

  test("draws a line between rules from where the words start", async ({
    page,
  }) => {
    await openGuide(page);

    expect(await ruleStartOf(rule(page, "Files", "Chapter"))).toBeCloseTo(
      RULE_INDENT,
      0,
    );
  });

  test("sets a rule's title at 17pt over its example names in monospace and its sentence, both 15pt and muted", async ({
    page,
  }) => {
    await openGuide(page);
    const row = rule(page, "Folders", "Volume made of chapters");
    const names = row.locator("code");
    const sentence = row.getByText(
      "Inside a series, it holds that volume’s chapters.",
    );
    const muted = await tokenColour(page, "--color-muted");

    await expect(
      row.getByText("Volume made of chapters", { exact: true }),
    ).toHaveCSS("font-size", "17px");
    await expect(names).toHaveText("Volume 03");
    await expect(names).toHaveCSS("font-family", MONOSPACE);
    await expect(names).toHaveCSS("font-size", "15px");
    await expect(names).toHaveCSS("color", muted);
    await expect(sentence).toHaveCSS("font-size", "15px");
    await expect(sentence).not.toHaveCSS("font-family", MONOSPACE);
  });

  test("draws a two-line rule 72pt tall with its icon centred", async ({
    page,
  }) => {
    await openGuide(page);
    const row = rule(page, "Files", "One-shot");
    const box = await boxOf(row);
    const icon = await boxOf(row.locator("[data-icon]"));

    expect(box.height).toBeCloseTo(TWO_LINE_ROW, 0);
    expect(icon.y + icon.height / 2).toBeCloseTo(box.y + box.height / 2, 0);
  });

  test("keeps the guide inside the screen at the largest text", async ({
    page,
  }) => {
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await openGuide(page);
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
}

test.describe("How folders are read on an iPhone", { tag: "@native" }, () => {
  test.use({ backend: DEFAULT_BACKEND });

  test.beforeEach(({ platform }) => {
    test.skip(platform !== "ios", "the iPhone's grouped guide");
  });

  describeTheGroupedGuide();
});

test.describe("How folders are read on an iPad", () => {
  testOnlyInItsWebview("ios");
  test.skip(({ hasTouch }) => !hasTouch, "an iPad has a touch screen");
  test.use(onPlatform("ios"));

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "iPads only");
  });

  describeTheGroupedGuide();
});
