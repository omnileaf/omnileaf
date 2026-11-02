import type { Page } from "@playwright/test";

import type { SeriesDetails } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  expect,
  literalColour,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const CONTROL_FILL = "rgba(0, 0, 0, 0.08)";
const CONTROL_FILL_PRESSED = "rgba(0, 0, 0, 0.16)";
const ACCENT = "#2f6f4f";
const NO_SHADOW = /^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/u;

const DETAILS = {
  title: { fromFile: SERIES_TITLE, source: "folderName", edited: null },
  people: { fromFile: [], edited: null },
  tags: { fromFile: [], edited: null },
  summary: { fromFile: "A lighthouse keeper’s apprentice.", edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;

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

async function loseFocus(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        window.dispatchEvent(new Event("blur"));
      });
      return page.evaluate(() =>
        document.documentElement.getAttribute("data-window-active"),
      );
    })
    .toBe("false");
}

async function takeFocusBack(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

async function openEditor(page: Page) {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("region", { name: "Details" })
    .getByRole("button", { name: "Edit details" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Edit details" });
  await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible();
  return sheet;
}

test.describe("a Mac window that lost focus", () => {
  test("fills a primary button with the control fill instead of the accent", async ({
    page,
  }) => {
    const save = (await openEditor(page)).getByRole("button", { name: "Save" });
    await expect(save).toHaveCSS(
      "background-color",
      await literalColour(page, ACCENT),
    );

    await loseFocus(page);

    await expect(save).toHaveCSS(
      "background-color",
      await literalColour(page, CONTROL_FILL),
    );
    await expect(save).toHaveCSS(
      "color",
      await tokenColour(page, "--color-foreground"),
    );
    await expect(save).toHaveCSS("box-shadow", NO_SHADOW);
  });

  test("draws the accent again once the window takes focus back", async ({
    page,
  }) => {
    const save = (await openEditor(page)).getByRole("button", { name: "Save" });
    await loseFocus(page);

    await takeFocusBack(page);

    await expect(save).toHaveCSS(
      "background-color",
      await literalColour(page, ACCENT),
    );
  });

  test("greys the chosen segment of a segmented control", async ({ page }) => {
    await page.goto("/settings/appearance");
    const chosen = page
      .getByRole("radiogroup", { name: "Light or dark" })
      .getByRole("radio", { checked: true });

    await loseFocus(page);

    await expect(chosen).toHaveCSS(
      "background-color",
      await literalColour(page, CONTROL_FILL_PRESSED),
    );
  });
});
