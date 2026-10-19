import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, settle, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  PAGE_COUNT,
  readerBackend,
  servePages,
} from "./reader-book.ts";

const LOOK_KEY = "omnileaf.readerSettings.all";
const GUIDE_SEEN = "omnileaf.readerGuide.leftToRight";
const DRAG_PX = 100;
const SHORT_DRAG_PX = 30;
const CLOSE_PX = 4;

test.use({
  backend: readerBackend(DEFAULT_BACKEND, {
    reading: { state: "started", page: 14 },
    startPage: 13,
  }),
});

async function openBookWith(page: Page, look: object): Promise<void> {
  await page.addInitScript(
    ({ key, value, guide }) => {
      localStorage.setItem(key, value);
      localStorage.setItem(guide, "seen");
    },
    { key: LOOK_KEY, value: JSON.stringify(look), guide: GUIDE_SEEN },
  );
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
  await expect(shownPage(page, 14)).toBeVisible();
}

function shownPage(page: Page, number: number): Locator {
  return page
    .getByRole("main")
    .getByRole("img", { name: `Page ${String(number)}`, exact: true });
}

async function leftOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("the page is not on screen");
  }
  return box.x;
}

async function expectOnPage(page: Page, number: number): Promise<void> {
  await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
    "aria-valuetext",
    `Page ${String(number)} of ${String(PAGE_COUNT)}`,
  );
}

async function dragBy(page: Page, across: number): Promise<void> {
  const box = await page.locator("[data-tap-zones]").boundingBox();
  if (box === null) {
    throw new Error("the tap zones are not on screen");
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + across, y, { steps: 5 });
}

test("moves the page with the finger while it slides, then turns it", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  const start = await leftOf(shownPage(page, 14));

  await dragBy(page, -DRAG_PX);

  expect(
    Math.abs((await leftOf(shownPage(page, 14))) - (start - DRAG_PX)),
  ).toBeLessThan(CLOSE_PX);
  await page.mouse.up();
  await expectOnPage(page, 15);
  await expect
    .poll(async () => Math.abs((await leftOf(shownPage(page, 15))) - start))
    .toBeLessThan(CLOSE_PX);
});

test("puts the page back when a slide stops short of turning it", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  const start = await leftOf(shownPage(page, 14));

  await dragBy(page, -SHORT_DRAG_PX);
  await page.mouse.up();

  await expect
    .poll(async () => Math.abs((await leftOf(shownPage(page, 14))) - start))
    .toBeLessThan(CLOSE_PX);
  await expectOnPage(page, 14);
});

test("keeps the page still under the finger when pages turn at once", async ({
  page,
}) => {
  await openBookWith(page, {});
  const start = await leftOf(shownPage(page, 14));

  await dragBy(page, -DRAG_PX);

  expect(await leftOf(shownPage(page, 14))).toBe(start);
  await page.mouse.up();
  await expectOnPage(page, 15);
});

test("settles a slide at once with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBookWith(page, { pageTurn: "slide" });
  const start = await leftOf(shownPage(page, 14));

  await dragBy(page, -SHORT_DRAG_PX);
  expect(await leftOf(shownPage(page, 14))).toBeLessThan(start - CLOSE_PX);
  await page.mouse.up();

  expect(Math.abs((await leftOf(shownPage(page, 14))) - start)).toBeLessThan(
    CLOSE_PX,
  );
});

test("chooses Slide under Pages in Reading settings", async ({ page }) => {
  await openBookWith(page, {});
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
  const settings = page
    .getByRole("dialog", { name: "Reading settings" })
    .or(page.getByRole("complementary", { name: "Reading settings" }));
  await expect(settings).toBeVisible();
  await settle(settings);

  const pages = page.getByRole("region", { name: "Pages" });
  await expect(pages.getByRole("group", { name: "Tap zones" })).toBeVisible();
  await expect(
    pages.getByText("Slide follows your finger.", { exact: false }),
  ).toBeVisible();
  await pages
    .getByRole("group", { name: "Page turn" })
    .getByRole("radio", { name: "Slide" })
    .click();

  await expect
    .poll(
      async () =>
        JSON.parse(
          (await page.evaluate((key) => localStorage.getItem(key), LOOK_KEY)) ??
            "{}",
        ) as unknown,
    )
    .toMatchObject({ pageTurn: "slide" });
  await expect(
    page
      .getByRole("region", { name: "Screen" })
      .getByRole("switch", { name: "Keep the screen on" }),
  ).toBeVisible();
});
