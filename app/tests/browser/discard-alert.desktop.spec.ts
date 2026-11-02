import type { Locator, Page } from "@playwright/test";

import type { SeriesDetails } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  literalColour,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

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

const TYPED_TITLE = "A title typed in the field";
const ALERT_WIDTH = 260;
const ALERT_CORNER = "34px";
const ALERT_ICON_SIZE = 54;
const ALERT_BUTTON_HEIGHT = 28;
const ALERT_SHEET_OFFSET = 12;
const COVER_WIDTH = 28;
const DESTRUCTIVE = {
  light: { fill: "#f6e3e3", ink: "#9b2c2c" },
  dark: { fill: "#3a2222", ink: "#f4a3a3" },
};

const shelf = new FakeShelf([{ state: "notStarted" }]);

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  seriesOverview: (id) => shelf.backend().seriesOverview(id),
  seriesBooks: (id, listing, after) =>
    shelf.backend().seriesBooks(id, listing, after),
  keepsDetailEdits: () => true,
  seriesDetails: () => DETAILS,
  editSeriesDetails: () => null,
};

testOnlyInItsWebview("macos");
test.use({
  backend: BACKEND,
  platform: "macos",
  viewport: { width: 1280, height: 800 },
});

async function openUnsaved(page: Page): Promise<{
  sheet: Locator;
  alert: Locator;
}> {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("region", { name: "Details" })
    .getByRole("button", { name: "Edit details" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Edit details" });
  await sheet.getByRole("textbox", { name: "Title" }).fill(TYPED_TITLE);
  await page.keyboard.press("Escape");
  const alert = page.getByRole("alertdialog", {
    name: "Discard your changes?",
  });
  await expect(alert).toBeVisible();
  return { sheet, alert };
}

test.describe("the Discard your changes alert on a Mac", () => {
  test("is a 260pt alert with 34pt corners and the app icon on top", async ({
    page,
  }) => {
    const { alert } = await openUnsaved(page);

    const frame = await boxOf(alert);
    const icon = await boxOf(alert.locator("img"));
    expect(frame.width).toBeCloseTo(ALERT_WIDTH, 0);
    await expect(alert).toHaveCSS("border-top-left-radius", ALERT_CORNER);
    expect(icon.width).toBeCloseTo(ALERT_ICON_SIZE, 0);
  });

  test("stacks Discard in red above Keep editing as full-width capsules", async ({
    page,
  }) => {
    const { alert } = await openUnsaved(page);
    const discard = alert.getByRole("button", { name: "Discard" });
    const keep = alert.getByRole("button", { name: "Keep editing" });

    const top = await boxOf(discard);
    const bottom = await boxOf(keep);

    expect(top.height).toBeCloseTo(ALERT_BUTTON_HEIGHT, 0);
    expect(bottom.y).toBeGreaterThan(top.y);
    await expect(discard).toHaveCSS(
      "background-color",
      await literalColour(page, DESTRUCTIVE.light.fill),
    );
    await expect(discard).toHaveCSS(
      "color",
      await literalColour(page, DESTRUCTIVE.light.ink),
    );
  });

  test("attaches to the sheet 12pt below its top, centred on it", async ({
    page,
  }) => {
    const { sheet, alert } = await openUnsaved(page);

    const sheetBox = await boxOf(sheet);
    const alertBox = await boxOf(alert);

    expect(alertBox.y - sheetBox.y).toBeCloseTo(ALERT_SHEET_OFFSET, 0);
    expect(alertBox.x + alertBox.width / 2).toBeCloseTo(
      sheetBox.x + sheetBox.width / 2,
      0,
    );
  });

  test("sets the series in a 28pt cover and a control-fill plate", async ({
    page,
  }) => {
    const { alert } = await openUnsaved(page);
    const plate = alert
      .locator("span.bg-well, span[data-confirm-thing]")
      .first();
    const cover = plate.locator("span").first();

    expect((await boxOf(cover)).width).toBeCloseTo(COVER_WIDTH, 0);
    await expect(plate).toHaveCSS("padding-top", "8px");
    await expect(plate).toHaveCSS("column-gap", "10px");
  });

  test("dims the sheet under the alert", async ({ page }) => {
    const { sheet } = await openUnsaved(page);

    const dim = sheet.locator("[data-sheet-dim]");

    await expect(dim).toBeVisible();
  });
});

for (const platform of ["linux", "windows"] as const) {
  test.describe(`the Discard your changes alert on ${platform}`, () => {
    test.use({ platform });

    test("keeps its own size, corners and cover", async ({ page }) => {
      const { sheet, alert } = await openUnsaved(page);

      const frame = await boxOf(alert);
      const cover = await boxOf(alert.locator("span.bg-well > span").first());

      expect(frame.width).not.toBeCloseTo(ALERT_WIDTH, 0);
      await expect(alert).not.toHaveCSS("border-top-left-radius", ALERT_CORNER);
      expect(cover.width).not.toBeCloseTo(COVER_WIDTH, 0);
      await expect(sheet.locator("[data-sheet-dim]")).toHaveCount(0);
    });
  });
}
