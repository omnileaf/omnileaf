import type { Locator, Page } from "@playwright/test";

import type { SeriesDetails } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const WINDOW = { width: 1280, height: 800 };
const SHORT_WINDOW = { width: 1280, height: 560 };

const DETAILS = {
  title: { fromFile: SERIES_TITLE, source: "folderName", edited: null },
  people: { fromFile: [{ name: "Author A", role: "story" }], edited: null },
  tags: { fromFile: ["Seinen", "Sea"], edited: null },
  summary: { fromFile: "A lighthouse keeper’s apprentice.", edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;

const shelf = new FakeShelf([{ state: "notStarted" }]);

const MACOS = {
  toolbar: 56,
  belowToolbar: 12,
  width: 600,
  corner: "16px",
  padding: "20px",
  shadow:
    /rgba\(0, 0, 0, 0\.3\) 0px 18px 54px.*rgba\(0, 0, 0, 0\.8\) 0px 0px 1px/u,
  title: { fontSize: "13px", lineHeight: "16px", fontWeight: "700" },
  subtitle: { fontSize: "11px", lineHeight: "14px", fontWeight: "400" },
  button: { height: 24, corner: "6px", gap: 8, trailing: 20 },
};

test.use({
  viewport: WINDOW,
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    keepsDetailEdits: () => true,
    seriesDetails: () => DETAILS,
  },
});

function editor(page: Page): Locator {
  return page.getByRole("dialog", { name: "Edit details" });
}

async function openEditor(page: Page): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("region", { name: "Details" })
    .getByRole("button", { name: "Edit details" })
    .click();
  await expect(
    editor(page).getByRole("textbox", { name: "Title" }),
  ).toBeVisible();
  return editor(page);
}

function typeOf(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontSize: style.fontSize,
      lineHeight: `${String(Math.round(Number.parseFloat(style.lineHeight)))}px`,
      fontWeight: style.fontWeight,
    };
  });
}

test.describe("Edit details on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use({ platform: "macos" });

  test("drops the sheet 12 below the toolbar, 600 wide and centred", async ({
    page,
  }) => {
    const sheet = await openEditor(page);

    const box = await boxOf(sheet);

    expect(box.y).toBeCloseTo(MACOS.toolbar + MACOS.belowToolbar, 0);
    expect(box.width).toBeCloseTo(MACOS.width, 0);
    expect(box.x + box.width / 2).toBeCloseTo(WINDOW.width / 2, 0);
  });

  test("keeps the sheet inside a short window", async ({ page }) => {
    await page.setViewportSize(SHORT_WINDOW);
    const sheet = await openEditor(page);

    const box = await boxOf(sheet);

    expect(box.y + box.height).toBeLessThanOrEqual(SHORT_WINDOW.height);
    await expect(sheet.getByRole("button", { name: "Save" })).toBeInViewport();
  });

  test("draws the sheet in the window colour with a 16 corner, 20 padding and the window shadow", async ({
    page,
  }) => {
    const sheet = await openEditor(page);

    await expect(sheet).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-sheet"),
    );
    await expect(sheet).toHaveCSS("border-top-left-radius", MACOS.corner);
    await expect(sheet).toHaveCSS("padding-top", MACOS.padding);
    await expect(sheet).toHaveCSS("padding-left", MACOS.padding);
    await expect(sheet).toHaveCSS("box-shadow", MACOS.shadow);
    await expect(sheet).toHaveCSS("border-top-width", "0px");
  });

  test("dims the window behind it with the Mac scrim", async ({ page }) => {
    await openEditor(page);

    await expect(page.locator("[data-dialog-overlay]")).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-scrim"),
    );
  });

  test("titles the sheet in Headline with no badge, and the series under it in Subhead", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const title = sheet.getByRole("heading", { name: "Edit details" });
    const subtitle = sheet.getByText(
      `${SERIES_TITLE} · your changes show only in Omnileaf`,
    );

    expect(await typeOf(title)).toEqual(MACOS.title);
    expect(await typeOf(subtitle)).toEqual(MACOS.subtitle);
    await expect(title.locator("xpath=..").locator("svg")).toHaveCount(0);
    expect((await boxOf(title)).y).toBeLessThan((await boxOf(subtitle)).y);
  });

  test("sets Cancel and Save at the trailing corner, 8 apart, as 24 tall Mac buttons", async ({
    page,
  }) => {
    const sheet = await openEditor(page);
    const cancel = sheet.getByRole("button", { name: "Cancel" });
    const save = sheet.getByRole("button", { name: "Save" });

    const cancelBox = await boxOf(cancel);
    const saveBox = await boxOf(save);
    const sheetBox = await boxOf(sheet);

    expect(saveBox.height).toBeCloseTo(MACOS.button.height, 0);
    expect(cancelBox.height).toBeCloseTo(MACOS.button.height, 0);
    expect(saveBox.x - (cancelBox.x + cancelBox.width)).toBeCloseTo(
      MACOS.button.gap,
      0,
    );
    expect(
      sheetBox.x + sheetBox.width - (saveBox.x + saveBox.width),
    ).toBeCloseTo(MACOS.button.trailing, 0);
    await expect(save).toHaveCSS("border-top-left-radius", MACOS.button.corner);
    await expect(save).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-primary"),
    );
    await expect(cancel).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-secondary"),
    );
  });
});

for (const platform of ["linux", "windows"] as const) {
  test.describe(`Edit details on ${platform}`, () => {
    test.use({ platform });

    test("stays a centred dialog with its badge before the title", async ({
      page,
    }) => {
      const sheet = await openEditor(page);

      const box = await boxOf(sheet);

      expect(box.y + box.height / 2).toBeCloseTo(WINDOW.height / 2, 0);
      await expect(sheet.locator("svg").first()).toBeVisible();
      await expect(
        sheet.getByRole("heading", { name: "Edit details" }),
      ).toHaveCSS("font-weight", "700");
    });
  });
}
