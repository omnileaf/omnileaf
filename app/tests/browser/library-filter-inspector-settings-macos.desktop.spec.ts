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
const SEGMENTED_HEIGHT = 20;
const LABEL_NOTE_GAP = 8;
const SMART_ROW_HEIGHT = 52;
const GROUP_RADIUS = "12px";
const GROUP_INLINE_PADDING = "10px";
const SIDE_BY_SIDE_ROW = 160;

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
      tags: ["Slice of life", "Seinen"],
      ratesAdult: true,
      keepsBookmarks: true,
      smart: ["quickReads", "forgotten", "duplicates"],
    }),
  },
});

function filterButton(page: Page, name = "Sort and filter"): Locator {
  return page.getByRole("button", { name, exact: true });
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

const ADULT_NOTE = "Adult age rating, or marked by hand.";
const BOOKMARK_NOTE = "Series with a bookmarked page.";

for (const [name, note, choices] of [
  ["18+", ADULT_NOTE, ["Any", "Only", "Hide"]],
  ["Bookmarked", BOOKMARK_NOTE, ["Any", "Only"]],
] as const) {
  test(`sets ${name} as a small segmented control with its one-line note between the label and the control`, async ({
    page,
  }) => {
    const inspector = await openInspector(page);

    const group = inspector.getByRole("radiogroup", { name, exact: true });
    for (const choice of choices) {
      await expect(
        group.getByRole("radio", { name: choice, exact: true }),
      ).toBeVisible();
    }
    await expect(group.getByRole("radio")).toHaveCount(choices.length);
    const label = await boxOf(inspector.getByText(name, { exact: true }));
    const hint = await boxOf(inspector.getByText(note, { exact: true }));
    const control = await boxOf(group);
    expect(hint.y - (label.y + label.height)).toBe(LABEL_NOTE_GAP);
    expect(control.y - (hint.y + hint.height)).toBe(LABEL_NOTE_GAP);
    expect(control.height).toBe(SEGMENTED_HEIGHT);
  });
}

test("filters the library when 18+ is set to Only and counts it on the toolbar button", async ({
  page,
}) => {
  const inspector = await openInspector(page);
  const only = inspector
    .getByRole("radiogroup", { name: "18+", exact: true })
    .getByRole("radio", { name: "Only" });

  await only.click();

  await expect(only).toBeChecked();
  await expect(
    filterButton(page, "Sort and filter, 1 filter on"),
  ).toBeVisible();
});

test("fills the chosen segment in the accent colour", async ({ page }) => {
  const inspector = await openInspector(page);
  const group = inspector.getByRole("radiogroup", { name: "Bookmarked" });

  const style = await drawn(group.getByRole("radio", { name: "Any" }), [
    "background-color",
  ]);

  expect(style["background-color"]).toBe(
    await tokenColour(page, "--native-color-button-primary"),
  );
});

function smartSectionOf(inspector: Locator): Locator {
  return inspector.locator("section", {
    has: inspector.page().getByRole("heading", { name: "Smart filters" }),
  });
}

test("sets Smart filters as its own section with the note under the heading", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const heading = await boxOf(
    inspector.getByRole("heading", { name: "Smart filters" }),
  );
  const note = await boxOf(
    inspector.getByText("They combine with the filters above."),
  );
  expect(note.y - (heading.y + heading.height)).toBe(LABEL_NOTE_GAP);
  await expect(smartSectionOf(inspector)).toHaveCount(1);
  await expect(smartSectionOf(inspector).getByRole("switch")).toHaveCount(3);
});

test("draws each smart filter as a grouped list row of at least 52px with a switch", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const forgotten = inspector.getByRole("switch", { name: "Forgotten" });
  const row = await boxOf(forgotten);
  expect(row.height).toBe(SMART_ROW_HEIGHT);
  for (const smart of await inspector.getByRole("switch").all()) {
    expect((await boxOf(smart)).height).toBeGreaterThanOrEqual(
      SMART_ROW_HEIGHT,
    );
  }
  const toggle = await boxOf(forgotten.locator("span[aria-hidden]"));
  expect(toggle.x + toggle.width).toBeLessThanOrEqual(row.x + row.width);
  expect(toggle.x).toBeGreaterThan(row.x + SIDE_BY_SIDE_ROW);
});

test("plates the smart filter rows in a rounded group with a rule between rows", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const rows = inspector.getByRole("switch");
  const group = rows.first().locator("xpath=..");
  const plate = await drawn(group, [
    "background-color",
    "border-top-left-radius",
    "padding-left",
  ]);
  const first = await drawn(rows.first(), ["border-bottom-width"]);
  const last = await drawn(rows.last(), ["border-bottom-width"]);
  expect(plate).toEqual({
    "background-color": await tokenColour(page, "--native-color-group"),
    "border-top-left-radius": GROUP_RADIUS,
    "padding-left": GROUP_INLINE_PADDING,
  });
  expect(first["border-bottom-width"]).toBe("1px");
  expect(last["border-bottom-width"]).toBe("0px");
});

test("sets a trailing note under the rows while Ready to clean up is not offered", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const last = await boxOf(inspector.getByRole("switch").last());
  const note = await boxOf(
    inspector.getByText(
      "Ready to clean up (downloaded and finished) appears once you have downloads.",
    ),
  );
  expect(note.y).toBeGreaterThan(last.y + last.height);
});

test("turns a smart filter on from anywhere on its row", async ({ page }) => {
  const inspector = await openInspector(page);
  const forgotten = inspector.getByRole("switch", { name: "Forgotten" });

  await inspector.getByText("Not opened in 3 months.").click();

  await expect(forgotten).toBeChecked();
  await expect(
    filterButton(page, "Sort and filter, 1 filter on"),
  ).toBeVisible();
});

test("keeps the inspector inside the window with the smart filters scrolled to", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  await inspector.getByRole("switch").last().scrollIntoViewIfNeeded();

  const box = await boxOf(inspector);
  const last = await boxOf(inspector.getByRole("switch").last());
  expect(last.y + last.height).toBeLessThanOrEqual(
    Math.min(box.y + box.height, viewportOf(page).height),
  );
});

for (const platform of ["windows", "linux"] as const) {
  test.describe(`keeping its look on ${platform}`, () => {
    test.use({ platform });

    test("keeps 18+ as the joined toggle buttons", async ({ page }) => {
      const panel = await openInspector(page);

      await expect(
        panel.getByRole("radiogroup", { name: "18+", exact: true }),
      ).toHaveCount(0);
      const only = panel.getByRole("radio", { name: "Only" }).first();
      expect((await boxOf(only)).height).toBeGreaterThan(SEGMENTED_HEIGHT);
    });

    test("keeps Smart filters as plain text under the Filter heading", async ({
      page,
    }) => {
      const panel = await openInspector(page);

      await expect(
        panel.getByRole("heading", { name: "Smart filters" }),
      ).toHaveCount(0);
      await expect(
        panel.getByText("Smart filters", { exact: true }),
      ).toBeVisible();
    });
  });
}
