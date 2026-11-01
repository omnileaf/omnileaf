import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6).map((series, index) => ({
  ...series,
  bookCount: 4 + index,
  unreadCount: 1 + (index % 3),
  language: "ja",
}));
const VIEW: LibraryView = {
  ...DEFAULT_LIBRARY_VIEW,
  display: "list",
  onCovers: {
    ...DEFAULT_LIBRARY_VIEW.onCovers,
    showsLanguage: true,
    showsUnreadCount: true,
  },
};
const ROW_RADIUS = "8px";
const SQUARE = "0px";

testOnlyInItsWebview("macos");
test.use({
  platform: "macos",
  viewport: { width: 1280, height: 800 },
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    libraryView: () => VIEW,
  },
});

function row(page: Page, index: number): Locator {
  return page.locator("[data-series-id]").nth(index);
}

async function colourOf(page: Page, colour: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.color = value;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, colour);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-series-id]")).toHaveCount(LIBRARY.length);
  await row(page, 1).getByRole("link").click();
  await row(page, 2)
    .getByRole("checkbox")
    .click({ modifiers: ["Meta"] });
  await row(page, 4)
    .getByRole("checkbox")
    .click({ modifiers: ["Meta"] });
});

test("fills a selected row with the accent and writes every cell in the colour on it", async ({
  page,
}) => {
  const accent = await colourOf(page, "var(--color-accent)");
  const onAccent = await colourOf(page, "var(--color-on-accent)");

  await expect(row(page, 4)).toHaveCSS("background-color", accent);
  await expect(row(page, 4)).toHaveCSS("color", onAccent);
  for (const cell of ["books", "unread", "language"]) {
    await expect(row(page, 4).locator(`[data-list-cell='${cell}']`)).toHaveCSS(
      "color",
      onAccent,
    );
  }
});

test("leaves a row that is not selected without the accent and with muted cells", async ({
  page,
}) => {
  const accent = await colourOf(page, "var(--color-accent)");
  const muted = await colourOf(page, "var(--color-muted)");

  await expect(row(page, 3)).not.toHaveCSS("background-color", accent);
  await expect(row(page, 3).locator("[data-list-cell='books']")).toHaveCSS(
    "color",
    muted,
  );
});

test("rounds a lone selected row on all four corners", async ({ page }) => {
  for (const corner of [
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
  ]) {
    await expect(row(page, 4)).toHaveCSS(corner, ROW_RADIUS);
  }
});

test("draws a run of selected rows as one block, square where they meet", async ({
  page,
}) => {
  await expect(row(page, 1)).toHaveCSS("border-top-left-radius", ROW_RADIUS);
  await expect(row(page, 1)).toHaveCSS("border-bottom-left-radius", SQUARE);
  await expect(row(page, 2)).toHaveCSS("border-top-right-radius", SQUARE);
  await expect(row(page, 2)).toHaveCSS(
    "border-bottom-right-radius",
    ROW_RADIUS,
  );
});

test("fills a selected row's progress bar in the colour on the accent so it shows", async ({
  page,
}) => {
  const onAccent = await colourOf(page, "var(--color-on-accent)");

  await expect(
    row(page, 4)
      .locator("[data-list-cell='progress'] [role='progressbar'] > div")
      .first(),
  ).toHaveCSS("background-color", onAccent);
});

test("lets the accent go with the selection", async ({ page }) => {
  const accent = await colourOf(page, "var(--color-accent)");

  await page.keyboard.press("Escape");

  await expect(row(page, 4)).not.toHaveCSS("background-color", accent);
});
