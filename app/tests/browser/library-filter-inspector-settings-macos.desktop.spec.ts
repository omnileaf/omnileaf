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
const WHITE = "rgb(255, 255, 255)";
const ACCENT_LIGHT = "rgb(47, 111, 79)";
const ACCENT_DARK = "rgb(46, 125, 85)";
const ROW_NOTE_TRACKING = "0.06px";
const SEGMENT_TRANSPARENT = "rgba(0, 0, 0, 0)";
const CENTRE_TOLERANCE = 1;

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

for (const [scheme, accent] of [
  ["light", ACCENT_LIGHT],
  ["dark", ACCENT_DARK],
] as const) {
  test.describe(`in ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("fills the chosen segment in the accent green with white ink", async ({
      page,
    }) => {
      const inspector = await openInspector(page);
      const group = inspector.getByRole("radiogroup", { name: "Bookmarked" });

      const style = await drawn(group.getByRole("radio", { name: "Any" }), [
        "background-color",
        "color",
      ]);

      expect(style).toEqual({ "background-color": accent, color: WHITE });
    });

    test("moves the accent fill to the segment chosen next", async ({
      page,
    }) => {
      const inspector = await openInspector(page);
      const group = inspector.getByRole("radiogroup", { name: "Bookmarked" });

      const only = group.getByRole("radio", { name: "Only" });
      const any = group.getByRole("radio", { name: "Any" });
      await only.click();

      await expect(only).toBeChecked();
      await expect(only).toHaveCSS("background-color", accent);
      await expect(only).toHaveCSS("color", WHITE);
      await expect(any).toHaveCSS("background-color", SEGMENT_TRANSPARENT);
    });
  });
}

test("chooses the next segment of 18+ with the arrow keys", async ({
  page,
}) => {
  const inspector = await openInspector(page);
  const group = inspector.getByRole("radiogroup", { name: "18+", exact: true });

  await group.getByRole("radio", { name: "Any" }).focus();
  await page.keyboard.press("ArrowRight");

  await expect(group.getByRole("radio", { name: "Only" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Hide" })).toBeChecked();
});

test("hides the adult series once 18+ is set to Hide and counts it on the toolbar button", async ({
  page,
}) => {
  const inspector = await openInspector(page);
  const hide = inspector
    .getByRole("radiogroup", { name: "18+", exact: true })
    .getByRole("radio", { name: "Hide" });

  await hide.click();

  await expect(hide).toBeChecked();
  await expect(
    filterButton(page, "Sort and filter, 1 filter on"),
  ).toBeVisible();
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
  const title = await boxOf(inspector.getByText("Forgotten", { exact: true }));
  expect(toggle.x + toggle.width).toBe(row.x + row.width);
  expect(title.x).toBe(row.x);
  expect(title.x + title.width).toBeLessThan(toggle.x);
  expect(
    Math.abs(toggle.y + toggle.height / 2 - (row.y + row.height / 2)),
  ).toBeLessThanOrEqual(CENTRE_TOLERANCE);
});

test("tracks the smart filter row notes at 0.06px as a list row's second line", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  await expect(
    inspector.getByText("Not opened in 3 months.", { exact: true }),
  ).toHaveCSS("letter-spacing", ROW_NOTE_TRACKING);
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

test("keeps the last smart filter above the match count and Reset once scrolled to", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  await inspector.getByRole("switch").last().scrollIntoViewIfNeeded();

  const last = await boxOf(inspector.getByRole("switch").last());
  const reset = await boxOf(inspector.getByRole("button", { name: "Reset" }));
  expect(last.y + last.height).toBeLessThanOrEqual(reset.y);
  expect(reset.y + reset.height).toBeLessThanOrEqual(viewportOf(page).height);
});

test.describe("while Ready to clean up is offered", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: () => ({ series: LIBRARY, next: null }),
      librarySeriesCount: () => LIBRARY.length,
      libraryFilterChoices: () => ({
        formats: ["comic"],
        languages: [],
        tags: [],
        ratesAdult: true,
        keepsBookmarks: true,
        smart: ["readyToCleanUp", "quickReads"],
      }),
    },
  });

  test("sets Ready to clean up as a row and leaves out the trailing note", async ({
    page,
  }) => {
    const inspector = await openInspector(page);

    await expect(
      inspector.getByRole("switch", { name: "Ready to clean up" }),
    ).toBeVisible();
    await expect(
      inspector.getByText("appears once you have downloads."),
    ).toHaveCount(0);
  });
});

test.describe("while no smart filter is offered", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: () => ({ series: LIBRARY, next: null }),
      librarySeriesCount: () => LIBRARY.length,
      libraryFilterChoices: () => ({
        formats: ["comic"],
        languages: [],
        tags: [],
        ratesAdult: true,
        keepsBookmarks: true,
        smart: [],
      }),
    },
  });

  test("leaves out the Smart filters section and its notes", async ({
    page,
  }) => {
    const inspector = await openInspector(page);

    await expect(
      inspector.getByRole("heading", { name: "Smart filters" }),
    ).toHaveCount(0);
    await expect(inspector.getByRole("switch")).toHaveCount(0);
    await expect(
      inspector.getByText("appears once you have downloads."),
    ).toHaveCount(0);
  });
});

for (const [offered, left, ratesAdult, keepsBookmarks] of [
  ["18+", "Bookmarked", true, false],
  ["Bookmarked", "18+", false, true],
] as const) {
  test.describe(`while only ${offered} is offered`, () => {
    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        librarySeries: () => ({ series: LIBRARY, next: null }),
        librarySeriesCount: () => LIBRARY.length,
        libraryFilterChoices: () => ({
          formats: ["comic"],
          languages: [],
          tags: [],
          ratesAdult,
          keepsBookmarks,
          smart: ["quickReads"],
        }),
      },
    });

    test(`sets ${offered} as a segmented control and leaves ${left} out`, async ({
      page,
    }) => {
      const inspector = await openInspector(page);

      await expect(
        inspector.getByRole("radiogroup", { name: offered, exact: true }),
      ).toBeVisible();
      await expect(
        inspector.getByRole("radiogroup", { name: left, exact: true }),
      ).toHaveCount(0);
    });
  });
}

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
