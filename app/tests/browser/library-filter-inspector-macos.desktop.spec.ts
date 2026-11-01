import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  settle,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const WINDOW = { width: 1280, height: 800 };
const LIBRARY = sampleSeries(12);
const INSPECTOR_WIDTH = 280;
const SMALL_BUTTON_HEIGHT = 20;
const LABEL_LINE_HEIGHT = 16;
const TITLE_ROW_HEIGHT = 52;
const SECTION_PADDING = 14;
const SECTION_GAP = 8;
const POP_UP_HEIGHT = 24;
const FOOTER_PADDING_BOTTOM = 16;
const NARROWEST_DOCKED_WIDTH = 1000;
const TOOLBAR_HEIGHT = 56;
const SHEET_WINDOW = { width: NARROWEST_DOCKED_WIDTH - 1, height: 800 };
const CHIP_HEIGHT = 24;
const CHIP_PADDING = "10px";
const CHIP_GAP = 6;
const CHIP_ICON_SIZE = 12;
const FORMAT_CHIP_COUNT = 3;
const SHORT_WINDOW = { width: 1280, height: 300 };

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    libraryFilterChoices: () => ({
      formats: ["comic", "manga", "book"],
      languages: ["ja", "en"],
      tags: ["Slice of life", "Seinen", "Sea", "Letters"],
      ratesAdult: false,
      keepsBookmarks: false,
      smart: [],
    }),
  },
});

function filterButton(page: Page): Locator {
  return page.getByRole("button", { name: "Sort and filter", exact: true });
}

function inspectorOf(page: Page): Locator {
  return page.getByRole("complementary", { name: "Sort and filter" });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
});

async function openInspector(page: Page): Promise<Locator> {
  await filterButton(page).click();
  await expect(inspectorOf(page)).toBeVisible();
  await settle(inspectorOf(page));
  return inspectorOf(page);
}

test("opens Sort and filter as a narrow inspector running the window's full height", async ({
  page,
}) => {
  const box = await boxOf(await openInspector(page));

  const { width, height } = viewportOf(page);
  expect(box.width).toBe(INSPECTOR_WIDTH);
  expect(box.x + box.width).toBeCloseTo(width, 0);
  expect(box.y).toBe(0);
  expect(box.height).toBeCloseTo(height, 0);
});

test("narrows the toolbar and the covers to the column beside the inspector", async ({
  page,
}) => {
  const box = await boxOf(await openInspector(page));

  const search = await boxOf(page.getByPlaceholder("Search the library"));
  const covers = await boxOf(page.getByRole("list", { name: "Series" }));
  expect(search.x + search.width).toBeLessThanOrEqual(box.x);
  expect(covers.x + covers.width).toBeLessThanOrEqual(box.x);
});

test("has no close button, since Sort and filter in the toolbar closes it", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  await expect(
    inspector.getByRole("button", { name: "Close sort and filter" }),
  ).toHaveCount(0);
  await filterButton(page).click();
  await expect(inspector).toBeHidden();
});

test("sets its title as plain headline text, without the round badge", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const title = inspector.getByRole("heading", { name: "Sort and filter" });
  const style = await title.evaluate((element) => {
    const drawn = getComputedStyle(element);
    return { size: drawn.fontSize, weight: drawn.fontWeight };
  });
  expect(style).toEqual({ size: "13px", weight: "700" });
  await expect(title.locator("xpath=..").locator("svg")).toHaveCount(0);
});

test("ends in the match count and a small Reset button", async ({ page }) => {
  const inspector = await openInspector(page);

  await expect(inspector.getByRole("status")).toHaveText("12 series match");
  const reset = await boxOf(inspector.getByRole("button", { name: "Reset" }));
  expect(reset.height).toBe(SMALL_BUTTON_HEIGHT);
});

test("stacks Sort by over the sort pop-up and its order button, all inside the inspector", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const box = await boxOf(inspector);
  const label = await boxOf(inspector.getByText("Sort by", { exact: true }));
  const sort = await boxOf(
    inspector.getByRole("combobox", { name: "Sort by" }),
  );
  const order = await boxOf(
    inspector.getByRole("group", { name: "Sort by" }).getByRole("button"),
  );
  expect(label.height).toBe(LABEL_LINE_HEIGHT);
  expect(sort.y - (label.y + label.height)).toBe(SECTION_GAP);
  expect(sort.y).toBe(order.y);
  expect(order.x + order.width).toBeLessThanOrEqual(box.x + box.width);
});

test("chooses the Read state from a pop-up, as System Settings does", async ({
  page,
}) => {
  const inspector = await openInspector(page);
  const readState = inspector.getByRole("combobox", { name: "Read state" });

  await readState.selectOption({ label: "Unread" });

  await expect(readState).toHaveValue("unread");
  await expect(
    inspector.getByRole("group", { name: "Read state" }),
  ).toHaveCount(0);
});

test("sets its section headings in the headline type", async ({ page }) => {
  const inspector = await openInspector(page);

  for (const name of ["Sort", "Filter"]) {
    const heading = inspector.getByRole("heading", { name, exact: true });
    const style = await heading.evaluate((element) => {
      const drawn = getComputedStyle(element);
      return { size: drawn.fontSize, weight: drawn.fontWeight };
    });
    expect(style).toEqual({ size: "13px", weight: "700" });
  }
});

function titleRowOf(inspector: Locator): Locator {
  return inspector
    .getByRole("heading", { name: "Sort and filter" })
    .locator("xpath=..");
}

async function drawn(
  locator: Locator,
  properties: readonly string[],
): Promise<Record<string, string>> {
  return locator.evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(
      names.map((name) => [name, style.getPropertyValue(name)]),
    );
  }, properties);
}

test("gives the title row the title bar's height", async ({ page }) => {
  const title = await boxOf(titleRowOf(await openInspector(page)));

  expect(title.height).toBe(TITLE_ROW_HEIGHT);
});

test("pads each section and sets the heading over its first label", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const title = await boxOf(titleRowOf(inspector));
  const heading = await boxOf(
    inspector.getByRole("heading", { name: "Sort", exact: true }),
  );
  const label = await boxOf(inspector.getByText("Sort by", { exact: true }));
  expect(heading.y - (title.y + title.height)).toBe(SECTION_PADDING);
  expect(label.y - (heading.y + heading.height)).toBe(SECTION_GAP);
});

test("rules off the Sort section from the Filter section, and leaves the last section bare", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const sections = inspector.locator("section");
  const first = await drawn(sections.first(), ["border-bottom-width"]);
  const last = await drawn(sections.last(), ["border-bottom-width"]);
  expect(first["border-bottom-width"]).toBe("1px");
  expect(last["border-bottom-width"]).toBe("0px");
});

test("draws the pop-ups as flat 24px controls in the button type", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  for (const name of ["Sort by", "Read state"]) {
    const popUp = inspector.getByRole("combobox", { name });
    const box = await boxOf(popUp);
    const style = await drawn(popUp, [
      "border-top-width",
      "font-size",
      "font-weight",
    ]);
    expect(box.height).toBe(POP_UP_HEIGHT);
    expect(style).toEqual({
      "border-top-width": "0px",
      "font-size": "13px",
      "font-weight": "510",
    });
  }
});

test("draws the sort order as a 24px button level with the pop-up", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const order = await boxOf(
    inspector.getByRole("group", { name: "Sort by" }).getByRole("button"),
  );
  expect(order.height).toBe(POP_UP_HEIGHT);
  expect(order.width).toBe(POP_UP_HEIGHT);
});

const BORDERED_CHIP = {
  "background-color": "oklch(1 0 0)",
  "border-top-width": "1px",
  "border-top-left-radius": "10px",
  "padding-left": "12px",
} as const;

const BORDERED_CHIP_PROPERTIES = [
  "background-color",
  "border-top-width",
  "border-top-left-radius",
  "padding-left",
] as const;

function chipsOf(inspector: Locator, name: string): Locator {
  return inspector.getByRole("group", { name, exact: true });
}

test("draws the Format chips as flat 24px control-fill buttons in the button type", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const chips = chipsOf(inspector, "Format").getByRole("button");
  await expect(chips).toHaveCount(FORMAT_CHIP_COUNT);
  const fill = await tokenColour(page, "--native-color-button-secondary");
  for (const chip of await chips.all()) {
    const box = await boxOf(chip);
    const style = await drawn(chip, [
      "background-color",
      "border-top-width",
      "border-top-left-radius",
      "padding-left",
      "font-size",
      "font-weight",
    ]);
    expect(box.height).toBe(CHIP_HEIGHT);
    expect(style).toEqual({
      "background-color": fill,
      "border-top-width": "0px",
      "border-top-left-radius": "6px",
      "padding-left": CHIP_PADDING,
      "font-size": "13px",
      "font-weight": "510",
    });
  }
});

test("sets a chosen chip in the accent tint with a 12px check", async ({
  page,
}) => {
  const inspector = await openInspector(page);
  const japanese = chipsOf(inspector, "Language").getByRole("button", {
    name: "Japanese",
  });

  await japanese.click();

  await expect(japanese).toHaveAttribute("aria-pressed", "true");
  await settle(japanese);
  await page.mouse.move(0, 0);
  const style = await drawn(japanese, ["background-color", "color"]);
  expect(style).toEqual({
    "background-color": await tokenColour(page, "--native-color-accent-soft"),
    color: await tokenColour(page, "--native-color-on-button-link"),
  });
  const check = await boxOf(japanese.locator("svg"));
  expect(check.width).toBe(CHIP_ICON_SIZE);
});

test("fills a chip darker under the pointer and darker again while pressed", async ({
  page,
}) => {
  const inspector = await openInspector(page);
  const chip = chipsOf(inspector, "Format").getByRole("button").first();

  await chip.hover();
  await settle(chip);
  const hovered = (await drawn(chip, ["background-color"]))["background-color"];
  await page.mouse.down();
  await settle(chip);
  const pressed = (await drawn(chip, ["background-color"]))["background-color"];
  await page.mouse.up();

  expect(hovered).toBe(
    await tokenColour(page, "--native-color-control-fill-hover"),
  );
  expect(pressed).toBe(
    await tokenColour(page, "--native-color-control-fill-pressed"),
  );
});

test("darkens a chosen chip while it is pressed", async ({ page }) => {
  const inspector = await openInspector(page);
  const chip = chipsOf(inspector, "Language").getByRole("button", {
    name: "Japanese",
  });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await settle(chip);
  const resting = (await drawn(chip, ["box-shadow"]))["box-shadow"];

  await chip.hover();
  await page.mouse.down();
  await settle(chip);
  const pressed = (await drawn(chip, ["box-shadow"]))["box-shadow"];
  await page.mouse.up();

  expect(pressed).not.toBe(resting);
  expect(pressed).toContain(await tokenColour(page, "--native-color-row-rule"));
});

test("edges a chip with the control stroke under increased contrast", async ({
  page,
}) => {
  const inspector = await openInspector(page);
  const chip = chipsOf(inspector, "Format").getByRole("button").first();
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-contrast", "more");
  });
  await settle(chip);

  const style = await drawn(chip, ["box-shadow"]);

  expect(style["box-shadow"]).toContain(
    await tokenColour(page, "--native-color-control-stroke"),
  );
});

test("spaces the chips 6px apart and sets the label 8px over them", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const label = await boxOf(inspector.getByText("Format", { exact: true }));
  const first = await boxOf(
    chipsOf(inspector, "Format").getByRole("button").first(),
  );
  const second = await boxOf(
    chipsOf(inspector, "Format").getByRole("button").nth(1),
  );
  expect(second.x - (first.x + first.width)).toBe(CHIP_GAP);
  expect(first.y - (label.y + label.height)).toBe(SECTION_GAP);
});

test("sets the Language label 8px under the Format chips, with no rule between the groups", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const formats = chipsOf(inspector, "Format");
  const chip = await boxOf(formats.getByRole("button").first());
  const next = await boxOf(inspector.getByText("Language", { exact: true }));
  expect(next.y - (chip.y + chip.height)).toBe(SECTION_GAP);
  for (const group of ["Format", "Language"]) {
    const wrapper = chipsOf(inspector, group).locator("xpath=..");
    const style = await drawn(wrapper, ["border-bottom-width"]);
    expect(style["border-bottom-width"]).toBe("0px");
  }
});

test("draws More tags as a chip like the tags and reveals the rest", async ({
  page,
}) => {
  const inspector = await openInspector(page);
  const more = inspector.getByRole("button", { name: "More tags" });

  const box = await boxOf(more);
  const style = await drawn(more, ["background-color", "padding-left"]);
  expect(box.height).toBe(CHIP_HEIGHT);
  expect(style).toEqual({
    "background-color": await tokenColour(
      page,
      "--native-color-button-secondary",
    ),
    "padding-left": CHIP_PADDING,
  });
  expect((await boxOf(more.locator("svg"))).width).toBe(CHIP_ICON_SIZE);
  await more.click();
  await expect(
    chipsOf(inspector, "Tags").getByRole("button", { name: "Letters" }),
  ).toBeVisible();
});

test("sets the match count in 13px body type", async ({ page }) => {
  const inspector = await openInspector(page);

  const style = await drawn(inspector.getByRole("status"), [
    "font-size",
    "line-height",
  ]);
  expect(style).toEqual({ "font-size": "13px", "line-height": "16px" });
});

test("ends 16px above the window's bottom edge", async ({ page }) => {
  const inspector = await openInspector(page);

  const box = await boxOf(inspector);
  const reset = await boxOf(inspector.getByRole("button", { name: "Reset" }));
  expect(box.y + box.height - (reset.y + reset.height)).toBe(
    FOOTER_PADDING_BOTTOM,
  );
});

test.describe("in a short window", () => {
  test.use({ viewport: SHORT_WINDOW });

  test("rules the title row off once the sections scroll beneath it", async ({
    page,
  }) => {
    const inspector = await openInspector(page);
    const title = titleRowOf(inspector);
    await expect
      .poll(
        async () =>
          (await drawn(title, ["border-bottom-width"]))["border-bottom-width"],
      )
      .toBe("0px");

    await inspector
      .getByRole("heading", { name: "Filter", exact: true })
      .locator("xpath=../..")
      .evaluate((body) => {
        body.scrollTop = 40;
      });

    await expect
      .poll(
        async () =>
          (await drawn(title, ["border-bottom-width"]))["border-bottom-width"],
      )
      .toBe("1px");
  });
});

test.describe("at the narrowest docked width", () => {
  test.use({ viewport: { width: NARROWEST_DOCKED_WIDTH, height: 800 } });

  test("keeps the toolbar on one line beside the inspector", async ({
    page,
  }) => {
    const inspector = await boxOf(await openInspector(page));

    const title = await boxOf(page.getByRole("heading", { name: "Library" }));
    const filter = await boxOf(filterButton(page));
    expect(title.y + title.height).toBeLessThanOrEqual(TOOLBAR_HEIGHT);
    expect(filter.y + filter.height).toBeLessThanOrEqual(TOOLBAR_HEIGHT);
    expect(filter.x + filter.width).toBeLessThanOrEqual(inspector.x);
  });
});

test.describe("in a window too narrow to dock the inspector", () => {
  test.use({ viewport: SHEET_WINDOW });

  test("keeps the sheet's side-by-side Sort by row and its segmented Read state", async ({
    page,
  }) => {
    await filterButton(page).click();
    const sheet = page.getByRole("dialog", { name: "Sort and filter" });
    await expect(sheet).toBeVisible();
    await settle(sheet);

    const label = await boxOf(sheet.getByText("Sort by", { exact: true }));
    const sort = await boxOf(sheet.getByRole("combobox", { name: "Sort by" }));
    expect(label.x + label.width).toBeLessThanOrEqual(sort.x);
    expect(label.y).toBeLessThan(sort.y + sort.height);
    expect(sort.y).toBeLessThan(label.y + label.height);
    await expect(sheet.getByRole("group", { name: "Read state" })).toHaveCount(
      1,
    );
  });

  test("keeps the sheet's bordered chips", async ({ page }) => {
    await filterButton(page).click();
    const sheet = page.getByRole("dialog", { name: "Sort and filter" });
    await expect(sheet).toBeVisible();
    await settle(sheet);

    const chip = chipsOf(sheet, "Format").getByRole("button").first();
    expect(await drawn(chip, BORDERED_CHIP_PROPERTIES)).toEqual(BORDERED_CHIP);
    const rule = await drawn(chipsOf(sheet, "Format").locator("xpath=.."), [
      "border-bottom-width",
    ]);
    expect(rule["border-bottom-width"]).toBe("1px");
  });
});

for (const platform of ["windows", "linux"] as const) {
  test.describe(`keeping its look on ${platform}`, () => {
    test.use({ platform });

    test("keeps the bordered chips", async ({ page }) => {
      const panel = await openInspector(page);

      const chip = chipsOf(panel, "Format").getByRole("button").first();
      expect(await drawn(chip, BORDERED_CHIP_PROPERTIES)).toEqual(
        BORDERED_CHIP,
      );
    });

    test("keeps the Sort by label beside its pop-up", async ({ page }) => {
      const panel = await openInspector(page);

      const label = await boxOf(panel.getByText("Sort by", { exact: true }));
      const sort = await boxOf(
        panel.getByRole("combobox", { name: "Sort by" }),
      );
      expect(label.x + label.width).toBeLessThanOrEqual(sort.x);
      expect(sort.height).toBeGreaterThan(POP_UP_HEIGHT);
    });
  });
}

test.describe("on Linux", () => {
  test.use({ platform: "linux" });

  test("keeps the wider panel under the toolbar, with its close button", async ({
    page,
  }) => {
    const panel = await openInspector(page);

    const box = await boxOf(panel);
    expect(box.width).toBe(340);
    expect(box.y).toBeGreaterThan(0);
    await expect(
      panel.getByRole("button", { name: "Close sort and filter" }),
    ).toBeVisible();
  });
});
