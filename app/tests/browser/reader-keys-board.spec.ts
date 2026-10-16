import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  fakeAppInfo,
  settle,
  test,
  transitionsOf,
  viewportOf,
  watchTransitions,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  readerBackend,
  servePages,
} from "./reader-book.ts";

const SHEET_WIDTH = 720;

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function sheet(page: Page): Locator {
  return page.getByRole("dialog", { name: "Keyboard shortcuts" });
}

function firstPage(page: Page): Locator {
  return page.getByRole("img", { name: "Page 1", exact: true });
}

function scrim(page: Page): Locator {
  return page.locator("[data-dialog-overlay]");
}

/** Takes every @starting-style rule out of the page's styles, as WebKit can skip them for an element inserted after the page loads. */
function dropStartingStyles(page: Page): Promise<number> {
  return page.evaluate(() => {
    function dropFrom(parent: CSSStyleSheet | CSSGroupingRule): number {
      let dropped = 0;
      for (let index = parent.cssRules.length - 1; index >= 0; index--) {
        const rule = parent.cssRules.item(index);
        if (rule?.cssText.startsWith("@starting-style")) {
          parent.deleteRule(index);
          dropped++;
        } else if (rule instanceof CSSGroupingRule) {
          dropped += dropFrom(rule);
        }
      }
      return dropped;
    }

    return [...document.styleSheets].reduce(
      (dropped, sheet) => dropped + dropFrom(sheet),
      0,
    );
  });
}

async function sheetAndScrimTransitions(
  page: Page,
): Promise<{ sheet: string[]; scrim: string[] }> {
  return {
    sheet: await transitionsOf(sheet(page)),
    scrim: await transitionsOf(scrim(page)),
  };
}

test("lists the reader's keys in a sheet opened with the question mark", async ({
  page,
}) => {
  await openBook(page);

  await page.keyboard.press("Shift+?");

  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole("heading", { level: 3 })).toHaveText([
    "Turning pages",
    "Reader",
    "Auto scroll",
    "Zoom",
  ]);
  await expect(sheet(page)).toContainText("Back to the series");
  await expect(sheet(page)).toContainText("Alt ←");
  await expect(sheet(page)).toHaveAccessibleDescription(
    "In right to left, ← turns to the next page and → goes back.",
  );
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
});

test("sets the keys in two columns, auto scroll and zoom beside turning pages, in a 720px sheet on desktops", async ({
  page,
}) => {
  await openBook(page);
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH,
    "narrower windows keep one column",
  );

  await page.keyboard.press("Shift+?");
  await settle(sheet(page));

  const turning = await boxOf(
    sheet(page).getByRole("heading", { level: 3, name: "Turning pages" }),
  );
  const autoScroll = await boxOf(
    sheet(page).getByRole("heading", { level: 3, name: "Auto scroll" }),
  );
  const zoom = await boxOf(
    sheet(page).getByRole("heading", { level: 3, name: "Zoom" }),
  );
  expect(autoScroll.x).toBeGreaterThan(turning.x + turning.width);
  expect(autoScroll.y).toBeCloseTo(turning.y, 0);
  expect(zoom.x).toBeCloseTo(autoScroll.x, 0);
  expect(zoom.y).toBeGreaterThan(autoScroll.y);
  expect((await boxOf(sheet(page))).width).toBe(SHEET_WIDTH);
});

test("says Space pauses and resumes auto scroll instead of turning the page while it runs", async ({
  page,
}) => {
  await openBook(page);

  await page.keyboard.press("Shift+?");

  const row = sheet(page)
    .getByRole("term")
    .filter({ hasText: "Pause or resume auto scroll" });
  await expect(row.locator("xpath=following-sibling::dd")).toHaveText("Space");
  await expect(sheet(page)).toContainText(
    "While auto scroll runs, Space pauses and resumes it instead of turning the page.",
  );
});

test("dims the page behind the sheet", async ({ page }) => {
  await openBook(page);

  await page.keyboard.press("Shift+?");

  await expect(page.locator("[data-dialog-overlay]")).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
});

test("slides the sheet in and fades the page behind it without @starting-style, and shows them at once when motion is reduced", async ({
  page,
}) => {
  await openBook(page);
  expect(await dropStartingStyles(page)).toBeGreaterThan(0);
  const transitions = await watchTransitions(page);

  await page.keyboard.press("Shift+?");

  await expect
    .poll(transitions)
    .toEqual(expect.arrayContaining(["dialog translate", "div opacity"]));
  await settle(sheet(page));
  const box = await boxOf(sheet(page));
  expect(box.x + box.width).toBeCloseTo(viewportOf(page).width, 0);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Shift+?");
  await expect(sheet(page)).toBeVisible();
  expect(await sheetAndScrimTransitions(page)).toEqual({
    sheet: [],
    scrim: [],
  });
});

test("opens the sheet from the keyboard button on desktops", async ({
  page,
}) => {
  await openBook(page);
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH,
    "phones leave keyboard shortcuts out",
  );

  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();

  await expect(sheet(page)).toBeVisible();
});

test("zooms the page with Ctrl and plus, and fits it again with Ctrl 0", async ({
  page,
}) => {
  await openBook(page);
  await expect(firstPage(page)).toBeVisible();
  const fitted = await boxOf(firstPage(page));

  await page.keyboard.press("Control+=");

  await expect(page.getByText("125% · Ctrl 0 to fit")).toBeVisible();
  expect((await boxOf(firstPage(page))).height).toBeCloseTo(
    fitted.height * 1.25,
    0,
  );
  await page.keyboard.press("Control+0");
  await expect(page.getByText(/ to fit$/)).toBeHidden();
});

test("zooms to twice the size with a double click in the middle, and back", async ({
  page,
}) => {
  await openBook(page);
  const middle = page.getByRole("button", { name: /the controls$/ });

  await middle.dblclick();

  await expect(page.getByText("200% · Ctrl 0 to fit")).toBeVisible();
  await expect(page.locator("main > header")).toHaveCSS("opacity", "0");
  await middle.dblclick();
  await expect(page.getByText(/ to fit$/)).toBeHidden();
});

test("zooms with Ctrl and the wheel", async ({ page, isMobile }) => {
  test.skip(isMobile, "pointer screens only");
  await openBook(page);
  await expect(firstPage(page)).toBeVisible();
  const box = await boxOf(firstPage(page));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");

  await expect(page.getByText("125% · Ctrl 0 to fit")).toBeVisible();
});

test.describe("on macOS", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      appInfo: () => fakeAppInfo("macos"),
    },
  });

  test("names the keys with ⌘", async ({ page }) => {
    await openBook(page);

    await page.keyboard.press("Shift+?");

    await expect(sheet(page)).toContainText("⌘ [");
    await expect(sheet(page)).toContainText("⌘ +");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Meta+=");
    await expect(page.getByText("125% · ⌘ 0 to fit")).toBeVisible();
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the shortcuts sheet has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openBook(page);
    await page.keyboard.press("Shift+?");
    await expect(sheet(page)).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
