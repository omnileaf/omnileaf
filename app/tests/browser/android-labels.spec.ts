import type { Locator, Page } from "@playwright/test";

import type {
  LibraryCategory,
  Platform,
  SeriesLabels,
} from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  LARGEST_TEXT_SCALE,
  screenSizeOf,
  setTextScale,
  settle,
  sidewaysOverflow,
  test,
  tokenColour,
} from "./fixtures.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";
import { overlaps, textClippedUnmarked } from "./text-fit.ts";

const HELD_MS = 800;
const CHIP_GAP_PX = 8;
const NARROW_PHONE_WIDTHS = [360, 320];
const PHONE_HEIGHT = 800;
const UNBROKEN_TAG_LENGTH = 60;
const UNBROKEN_TAG = "Unbroken".padEnd(UNBROKEN_TAG_LENGTH, "o");
const MANY_SUGGESTIONS = [
  "Action",
  "Dark Fantasy",
  "Fantasy",
  "Steampunk",
  "Superhero",
  "Psychological thriller",
  "Slice of life",
];
const LIBRARY = sampleSeries(6);
const CATEGORIES = [
  { id: "reading", name: "Reading" },
  { id: "manga", name: "Manga" },
] as LibraryCategory[];

function labelsFor(series: readonly string[]): SeriesLabels {
  return {
    keepsLabels: true,
    categories: [
      { category: CATEGORIES[0] as LibraryCategory, holding: series.length },
      { category: CATEGORIES[1] as LibraryCategory, holding: 0 },
    ],
    tags: [{ tag: "Sea", holding: series.length }],
    suggestedTags: ["Letters"],
  };
}

function suggesting(suggestedTags: string[]): FakeBackend {
  return {
    ...new FakeShelf([{ state: "notStarted" }]).backend(),
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    seriesLabels: (series) => ({ ...labelsFor(series), suggestedTags }),
  };
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    seriesLabels: (series) => labelsFor(series),
  },
});

async function openLabels(page: Page): Promise<Locator> {
  await page.goto("/");
  const list = page.getByRole("list", { name: "Series" });
  const second = list.getByRole("listitem").nth(1);
  await expect(second).toBeVisible();
  const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
  await second.getByRole("link").first().dispatchEvent("pointerdown", touch);
  await page.waitForTimeout(HELD_MS);
  const picked = list.getByRole("checkbox", { name: LIBRARY[1]?.title ?? "" });
  await picked.dispatchEvent("pointerup", touch);
  await picked.dispatchEvent("click");
  await page
    .getByRole("group", { name: "Selected series" })
    .getByRole("button", { name: "Categories" })
    .click();
  return shownLabels(page);
}

async function openLabelsFromSeries(page: Page): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("button", { name: `More for ${SERIES_TITLE}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Categories and tags…" }).click();
  return shownLabels(page);
}

async function shownLabels(page: Page): Promise<Locator> {
  const sheet = page.getByRole("dialog", { name: "Categories and tags" });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  return sheet;
}

function segmentLabelType(
  page: Page,
): Promise<{ readonly size: string; readonly weight: string }> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.fontSize = "var(--native-text-segment)";
    probe.style.fontWeight = "var(--native-weight-segment)";
    document.body.append(probe);
    const { fontSize, fontWeight } = getComputedStyle(probe);
    probe.remove();
    return { size: fontSize, weight: fontWeight };
  });
}

test.describe(
  "the categories and tags sheet on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Material sheet");
    });

    test("sets the title at title large with no badge, and what it does under it at 14px", async ({
      page,
    }) => {
      const sheet = await openLabels(page);
      const title = sheet.getByRole("heading", { name: "Categories and tags" });
      const note = sheet.getByText("For 1 series", { exact: false });

      await expect(title).toHaveCSS("font-size", "22px");
      await expect(title).toHaveCSS("line-height", "28px");
      await expect(title).toHaveCSS("font-weight", "400");
      expect((await boxOf(title)).x - (await boxOf(sheet)).x).toBeCloseTo(
        16,
        0,
      );
      await expect(note).toHaveCSS("font-size", "14px");
    });

    test("heads Categories and Tags in the green accent", async ({ page }) => {
      const sheet = await openLabels(page);

      for (const name of ["Categories", "Tags"]) {
        const heading = sheet.getByRole("heading", { name, exact: true });
        await expect(heading).toHaveCSS("font-size", "14px");
        await expect(heading).toHaveCSS("font-weight", "500");
        await expect(heading).toHaveCSS(
          "color",
          await tokenColour(page, "--native-color-on-button-plain"),
        );
      }
    });

    test("sets each category as a 16px row with its checkbox at the end and no rule between rows", async ({
      page,
    }) => {
      const sheet = await openLabels(page);
      const title = sheet.getByText("Reading", { exact: true });
      const box = sheet.getByRole("checkbox", { name: "Reading" });

      const sheetBox = await boxOf(sheet);
      const boxBox = await boxOf(box);

      await expect(title).toHaveCSS("font-size", "16px");
      await expect(title).toHaveCSS("line-height", "24px");
      expect((await boxOf(title)).x - sheetBox.x).toBeCloseTo(16, 0);
      expect(
        sheetBox.x + sheetBox.width - (boxBox.x + boxBox.width),
      ).toBeLessThanOrEqual(32);
      expect(boxBox.x).toBeGreaterThan(sheetBox.x + sheetBox.width / 2);
      await expect(box.locator("xpath=../..")).toHaveCSS(
        "border-top-width",
        "0px",
      );
    });

    test("draws the New category and Add a tag fields as 56px outlined boxes with a 4px corner, 16px in from the edge", async ({
      page,
    }) => {
      const sheet = await openLabels(page);
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      const sheetBox = await boxOf(sheet);

      for (const name of ["New category", "Add a tag"]) {
        const field = sheet.getByRole("textbox", { name });
        const group = field.locator("xpath=..");
        const box = await boxOf(group);

        expect(box.height).toBeCloseTo(56, 0);
        expect(box.x - sheetBox.x).toBeCloseTo(16, 0);
        await expect(group).toHaveCSS("border-top-left-radius", "4px");
        await expect(group).toHaveCSS(
          "border-top-color",
          await tokenColour(page, "--native-color-button-outline-edge"),
        );
      }
    });

    test("draws each tag as a 32px chip with an 8px corner, the one on every series filled with the soft accent", async ({
      page,
    }) => {
      const sheet = await openLabels(page);
      const sea = sheet
        .getByRole("listitem")
        .filter({ hasText: "Sea" })
        .first();

      expect((await boxOf(sea)).height).toBeCloseTo(32, 0);
      await expect(sea).toHaveCSS("border-top-left-radius", "8px");
      await expect(sea).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-accent-soft"),
      );
      expect(
        (
          await boxOf(
            sea.getByRole("button", { name: "Remove Sea" }).locator("svg"),
          )
        ).width,
      ).toBeCloseTo(18, 0);
    });

    test("ends the sheet with one full-width Done button 56px tall, 16px from the foot", async ({
      page,
    }) => {
      const sheet = await openLabels(page);
      const sheetBox = await boxOf(sheet);
      const done = await boxOf(sheet.getByRole("button", { name: "Done" }));

      expect(done.height).toBeCloseTo(56, 0);
      expect(done.x - sheetBox.x).toBeCloseTo(16, 0);
      expect(done.width).toBeCloseTo(sheetBox.width - 32, 0);
      expect(sheetBox.y + sheetBox.height - (done.y + done.height)).toBeCloseTo(
        16,
        0,
      );
    });

    test.describe("with many suggested tags", () => {
      test.use({ backend: suggesting(MANY_SUGGESTIONS) });

      test("sets the Suggested label in the sheet's label type and colour", async ({
        page,
      }) => {
        const sheet = await openLabels(page);
        const label = sheet.getByText("Suggested", { exact: true });
        const type = await segmentLabelType(page);

        await expect(label).toHaveCSS("font-size", type.size);
        await expect(label).toHaveCSS("font-weight", type.weight);
        await expect(label).toHaveCSS(
          "color",
          await tokenColour(page, "--color-foreground"),
        );
      });

      test("draws each suggestion as a 32px chip with an 8px corner and an 18px plus", async ({
        page,
      }) => {
        const sheet = await openLabels(page);

        for (const tag of MANY_SUGGESTIONS) {
          const chip = sheet.getByRole("button", { name: `Add ${tag}` });

          expect((await boxOf(chip)).height).toBeCloseTo(32, 0);
          await expect(chip).toHaveCSS("border-top-left-radius", "8px");
          expect((await boxOf(chip.locator("svg"))).width).toBeCloseTo(18, 0);
        }
      });

      test("writes each suggestion in the foreground colour with its plus in the accent", async ({
        page,
      }) => {
        const sheet = await openLabels(page);
        const foreground = await tokenColour(page, "--color-foreground");
        const accent = await tokenColour(
          page,
          "--native-color-on-button-plain",
        );

        for (const tag of MANY_SUGGESTIONS) {
          const chip = sheet.getByRole("button", { name: `Add ${tag}` });

          await expect(chip).toHaveCSS("color", foreground);
          await expect(chip.locator("svg")).toHaveCSS("color", accent);
        }
      });

      test("lines the suggestions up with Add a tag, under a Suggested label of their own", async ({
        page,
      }) => {
        const sheet = await openLabels(page);
        const field = await boxOf(
          sheet.getByRole("textbox", { name: "Add a tag" }).locator("xpath=.."),
        );
        const label = await boxOf(
          sheet.getByText("Suggested", { exact: true }),
        );
        const chips = await Promise.all(
          MANY_SUGGESTIONS.map((tag) =>
            boxOf(sheet.getByRole("button", { name: `Add ${tag}` })),
          ),
        );
        const lines = [...new Set(chips.map(({ y }) => y))];

        expect(label.x).toBeCloseTo(field.x, 0);
        expect(label.y + label.height).toBeLessThanOrEqual(Math.min(...lines));
        expect(Math.min(...chips.map(({ x }) => x))).toBeCloseTo(field.x, 0);
        expect(
          Math.max(...chips.map(({ x, width }) => x + width)),
        ).toBeLessThanOrEqual(field.x + field.width);
        expect(lines.length).toBeGreaterThan(1);
        expect(await sidewaysOverflow(page, "[role=dialog]")).toEqual([]);
      });

      test("puts the suggestions 8px under the Suggested label, 8px apart in a row and between rows", async ({
        page,
      }) => {
        const sheet = await openLabels(page);
        const label = await boxOf(
          sheet.getByText("Suggested", { exact: true }),
        );
        const chips = await Promise.all(
          MANY_SUGGESTIONS.map((tag) =>
            boxOf(sheet.getByRole("button", { name: `Add ${tag}` })),
          ),
        );
        const [first, second] = chips;
        const nextLine = chips.find(({ y }) => y > (first?.y ?? 0));

        expect((first?.y ?? 0) - (label.y + label.height)).toBeCloseTo(
          CHIP_GAP_PX,
          0,
        );
        expect(
          (second?.x ?? 0) - ((first?.x ?? 0) + (first?.width ?? 0)),
        ).toBeCloseTo(CHIP_GAP_PX, 0);
        expect(
          (nextLine?.y ?? 0) - ((first?.y ?? 0) + (first?.height ?? 0)),
        ).toBeCloseTo(CHIP_GAP_PX, 0);
      });
    });

    test.describe("with a suggestion of 60 letters and no spaces", () => {
      test.use({ backend: suggesting([...MANY_SUGGESTIONS, UNBROKEN_TAG]) });

      test("keeps the suggestions inside the sheet without one chip overlapping another", async ({
        page,
      }) => {
        const sheet = await openLabels(page);

        await expect(
          sheet.getByRole("button", { name: `Add ${UNBROKEN_TAG}` }),
        ).toBeVisible();
        expect(await sidewaysOverflow(page, "[role=dialog]")).toEqual([]);
        expect(await overlaps(page)).toEqual([]);
      });

      test("keeps the suggestions inside the sheet at the largest text, none overlapping or cut off", async ({
        page,
      }) => {
        await setTextScale(page, LARGEST_TEXT_SCALE);

        const sheet = await openLabels(page);

        await expect(
          sheet.getByRole("button", { name: `Add ${UNBROKEN_TAG}` }),
        ).toBeVisible();
        expect(await sidewaysOverflow(page, "[role=dialog]")).toEqual([]);
        expect(await overlaps(page)).toEqual([]);
        expect(await textClippedUnmarked(page)).toEqual([]);
      });

      for (const width of NARROW_PHONE_WIDTHS) {
        test.describe(`on a phone ${String(width)}px wide`, () => {
          test.use({ viewport: { width, height: PHONE_HEIGHT } });

          test("keeps the tag and its whole Remove button inside the sheet once it is added", async ({
            page,
          }) => {
            const sheet = await openLabels(page);

            await addUnbrokenTag(sheet);

            await expectUnbrokenTagInside(page, sheet);
          });
        });
      }
    });
  },
);

async function addUnbrokenTag(sheet: Locator): Promise<void> {
  await sheet.getByRole("button", { name: `Add ${UNBROKEN_TAG}` }).click();
}

async function expectUnbrokenTagInside(
  page: Page,
  sheet: Locator,
): Promise<void> {
  const removeName = { name: `Remove ${UNBROKEN_TAG}`, exact: true };
  const remove = sheet.getByRole("button", removeName);
  const chip = sheet
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", removeName) });
  await expect(remove).toBeVisible();
  const sheetBox = await boxOf(sheet);
  const removeBox = await boxOf(remove);

  expect(await sidewaysOverflow(page, "[role=dialog]")).toEqual([]);
  expect(removeBox.x).toBeGreaterThanOrEqual(sheetBox.x);
  expect(removeBox.x + removeBox.width).toBeLessThanOrEqual(
    sheetBox.x + sheetBox.width,
  );
  await expect(chip).toContainText(UNBROKEN_TAG);
}

function testSuggestedTags(
  backend: FakeBackend,
  open: (page: Page, platform: Platform | undefined) => Promise<Locator>,
): void {
  test.use({ backend });

  test("holds every suggestion in a group named Suggested", async ({
    page,
    platform,
  }) => {
    const sheet = await open(page, platform);

    await expect(
      sheet.getByRole("group", { name: "Suggested" }).getByRole("button"),
    ).toHaveText([...MANY_SUGGESTIONS, UNBROKEN_TAG]);
  });

  test("keeps a 60-letter suggestion inside the dialog", async ({
    page,
    platform,
  }) => {
    const sheet = await open(page, platform);

    await expect(
      sheet.getByRole("button", { name: `Add ${UNBROKEN_TAG}` }),
    ).toBeVisible();
    expect(await sidewaysOverflow(page, "[role=dialog]")).toEqual([]);
  });

  test("keeps a 60-letter tag inside the dialog once it is added", async ({
    page,
    platform,
  }) => {
    const sheet = await open(page, platform);

    await addUnbrokenTag(sheet);

    await expectUnbrokenTagInside(page, sheet);
  });
}

test.describe("the suggested tags", { tag: "@native" }, () => {
  testSuggestedTags(
    suggesting([...MANY_SUGGESTIONS, UNBROKEN_TAG]),
    (page, platform) =>
      platform === "ios" ? openLabelsFromSeries(page) : openLabels(page),
  );
});

test.describe("the suggested tags on an iPad", () => {
  test.beforeEach(({ browserName, page }) => {
    test.skip(
      browserName !== "webkit" || screenSizeOf(page) !== "tablet",
      "an iPad is WebKit at a tablet's size",
    );
  });

  testSuggestedTags(
    {
      ...suggesting([...MANY_SUGGESTIONS, UNBROKEN_TAG]),
      appInfo: () => fakeAppInfo("ios"),
    },
    openLabels,
  );
});

test.describe("the suggested tags on an Android tablet", () => {
  test.beforeEach(({ browserName, page }) => {
    test.skip(
      browserName !== "chromium" || screenSizeOf(page) !== "tablet",
      "an Android tablet is Chromium at a tablet's size",
    );
  });

  testSuggestedTags(
    {
      ...suggesting([...MANY_SUGGESTIONS, UNBROKEN_TAG]),
      appInfo: () => fakeAppInfo("android"),
    },
    openLabels,
  );
});
