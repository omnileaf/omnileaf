import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  settle,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  readerBackend,
  servePages,
} from "./reader-book.ts";

const PANEL_WIDTH = 368;
const CONTROL_WIDTH = { wide: 208, narrow: 228 } as const;
const ROW_GRID_GROUPS = ["Page layout", "Fit", "Background", "Controls"];

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function settingsPanel(page: Page): Locator {
  return isWide(page)
    ? page.getByRole("complementary", { name: "Reading settings" })
    : page.getByRole("dialog", { name: "Reading settings" });
}

async function openSettings(page: Page): Promise<Locator> {
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
  await expect(settingsPanel(page)).toBeVisible();
  return settingsPanel(page);
}

async function choose(panel: Locator, group: string, choice: string) {
  await panel
    .getByRole("group", { name: group })
    .getByRole("radio", { name: choice, exact: true })
    .click();
}

test("opens Reading settings beside the page on desktops and in a drawer on phones", async ({
  page,
}) => {
  await openBook(page);

  const panel = await openSettings(page);

  if (isWide(page)) {
    expect(Math.round((await boxOf(panel)).width)).toBe(PANEL_WIDTH);
    const shown = await boxOf(page.getByRole("img", { name: "Page 1" }));
    expect(shown.x + shown.width).toBeLessThan(
      viewportOf(page).width - PANEL_WIDTH,
    );
  }
  await expect(
    panel.getByRole("group", { name: "Apply to" }).getByRole("radio"),
  ).toHaveText(["This series", "All series"]);
});

function centreOf(box: { y: number; height: number }): number {
  return box.y + box.height / 2;
}

test("lays the settings on one row grid, a hairline between rows and every control on one right edge", async ({
  page,
}) => {
  await openBook(page);
  const panel = await openSettings(page);
  await settle(page.locator("body"));
  const mode = await boxOf(
    panel.getByRole("combobox", { name: "Reading mode" }),
  );
  const modeLabel = await boxOf(
    panel.getByText("Reading mode", { exact: true }),
  );

  expect(centreOf(modeLabel)).toBeCloseTo(centreOf(mode), 0);
  expect(Math.round(mode.width)).toBe(
    isWide(page) ? CONTROL_WIDTH.wide : CONTROL_WIDTH.narrow,
  );
  await expect(panel.locator('[data-slot="setting-row"]').nth(1)).toHaveCSS(
    "border-bottom-width",
    "1px",
  );
  if (!isWide(page)) {
    return;
  }
  const rightEdge = Math.round(mode.x + mode.width);
  for (const name of ROW_GRID_GROUPS) {
    const group = await boxOf(panel.getByRole("group", { name }));
    expect(Math.round(group.x + group.width), name).toBe(rightEdge);
    expect(Math.round(group.width), name).toBe(CONTROL_WIDTH.wide);
  }
  const brightness = await boxOf(
    panel.getByRole("slider", { name: "Brightness" }).locator(".."),
  );
  expect(Math.round(brightness.x + brightness.width)).toBe(rightEdge);
});

test("names the layouts in full and says how to zoom, on phones", async ({
  page,
}) => {
  await openBook(page);
  test.skip(isWide(page), "desktops name them One and Two beside the label");

  const panel = await openSettings(page);

  const layout = panel.getByRole("group", { name: "Page layout" });
  await expect(layout.getByRole("radio", { name: "One page" })).toBeVisible();
  await expect(layout.getByRole("radio", { name: "Two pages" })).toBeVisible();
  await expect(
    panel.getByText("Pinch or double-tap a page to zoom."),
  ).toBeVisible();
});

test("paints the page's ground in the background chosen", async ({ page }) => {
  await openBook(page);
  const panel = await openSettings(page);

  await choose(panel, "Background", "White");

  await expect(page.getByRole("main")).toHaveCSS(
    "background-color",
    await tokenColour(page, "--reader-white"),
  );
});

test("draws the controls on the app's own colours when they match the app", async ({
  page,
}) => {
  await openBook(page);
  const panel = await openSettings(page);
  await expect(page.getByRole("main")).toHaveAttribute("data-theme", "dark");

  await choose(panel, "Controls", "Match the app");

  await expect(page.getByRole("main")).not.toHaveAttribute("data-theme");
});

test("dims the page with Light, from the quick setting's popover", async ({
  page,
}) => {
  await openBook(page);
  const light = page
    .getByRole("group", { name: "Quick settings" })
    .getByRole("button", { name: "Light" });

  await light.click();

  await expect(light).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("dialog", { name: "Light, for this reader only" }),
  ).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Brightness" }).first(),
  ).toHaveAttribute("aria-valuenow", "80");
});

test("keeps a series' own settings once they apply to this series", async ({
  page,
}) => {
  await openBook(page);
  const panel = await openSettings(page);
  await choose(panel, "Apply to", "This series");
  await choose(panel, "Background", "Grey");

  await page.reload();
  const again = await openSettings(page);

  await expect(
    again
      .getByRole("group", { name: "Apply to" })
      .getByRole("radio", { name: "This series" }),
  ).toBeChecked();
  await expect(
    again
      .getByRole("group", { name: "Background" })
      .getByRole("radio", { name: "Grey" }),
  ).toBeChecked();
});

test("closes the panel with Escape before leaving the book", async ({
  page,
}) => {
  await openBook(page);
  test.skip(!isWide(page), "phones close the drawer like any sheet");
  await openSettings(page);

  await page.keyboard.press("Escape");

  await expect(settingsPanel(page)).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
});

test("keeps the screen on while reading", async ({ page }) => {
  await page.addInitScript(() => {
    const asked: string[] = [];
    Object.defineProperty(window, "wakeLocksAsked", { value: asked });
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: (type: string) => {
          asked.push(type);
          return Promise.resolve({ release: () => Promise.resolve() });
        },
      },
    });
  });
  await openBook(page);

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { wakeLocksAsked: string[] }).wakeLocksAsked,
      ),
    )
    .toEqual(["screen"]);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Reading settings have no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openBook(page);
    await openSettings(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
