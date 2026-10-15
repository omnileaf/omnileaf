import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  fakeAppInfo,
  test,
  viewportOf,
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

test("lists the reader's keys in a sheet opened with the question mark", async ({
  page,
}) => {
  await openBook(page);

  await page.keyboard.press("Shift+?");

  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole("heading", { level: 3 })).toHaveText([
    "Turning pages",
    "Reader",
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

test("sets the keys in two columns, zoom beside turning pages, in a 720px sheet on desktops", async ({
  page,
}) => {
  await openBook(page);
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH,
    "narrower windows keep one column",
  );

  await page.keyboard.press("Shift+?");

  const turning = await boxOf(
    sheet(page).getByRole("heading", { level: 3, name: "Turning pages" }),
  );
  const zoom = await boxOf(
    sheet(page).getByRole("heading", { level: 3, name: "Zoom" }),
  );
  expect(zoom.x).toBeGreaterThan(turning.x + turning.width);
  expect(zoom.y).toBeCloseTo(turning.y, 0);
  expect((await boxOf(sheet(page))).width).toBe(SHEET_WIDTH);
});

test("dims the page behind the sheet", async ({ page }) => {
  await openBook(page);

  await page.keyboard.press("Shift+?");

  await expect(page.locator("[data-dialog-overlay]")).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
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
