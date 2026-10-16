import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  PAGE_COUNT,
  readerBackend,
  servePages,
} from "./reader-book.ts";

const LOOK_KEY = "omnileaf.readerSettings.all";
const GUIDES_SEEN = [
  "omnileaf.readerGuide.leftToRight",
  "omnileaf.readerGuide.zones.lShape",
  "omnileaf.readerGuide.zones.off",
];

test.use({
  backend: readerBackend(DEFAULT_BACKEND, {
    reading: { state: "started", page: 14 },
    startPage: 13,
  }),
});

async function openBookWith(
  page: Page,
  look: object,
  seen: readonly string[] = GUIDES_SEEN,
): Promise<void> {
  await page.addInitScript(
    ({ key, value, guides }) => {
      localStorage.setItem(key, value);
      for (const guide of guides) {
        localStorage.setItem(guide, "seen");
      }
    },
    { key: LOOK_KEY, value: JSON.stringify(look), guides: [...seen] },
  );
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function slider(page: Page): Locator {
  return page.getByRole("slider", { name: "Page" });
}

async function expectOnPage(page: Page, number: number): Promise<void> {
  await expect(slider(page)).toHaveAttribute(
    "aria-valuetext",
    `Page ${String(number)} of ${String(PAGE_COUNT)}`,
  );
}

async function tapAt(page: Page, across: number, down: number): Promise<void> {
  const zones = page.locator("[data-tap-zones]");
  const box = await zones.boundingBox();
  if (box === null) {
    throw new Error("the tap zones are not on screen");
  }
  await page.mouse.click(box.x + box.width * across, box.y + box.height * down);
}

test("turns back from the top and the left, and on from the right and the bottom, with L-shaped zones", async ({
  page,
}) => {
  await openBookWith(page, { tapZones: "lShape" });
  await expectOnPage(page, 14);

  await tapAt(page, 0.5, 0.1);
  await expectOnPage(page, 13);
  await tapAt(page, 0.9, 0.5);
  await expectOnPage(page, 14);
  await tapAt(page, 0.5, 0.9);
  await expectOnPage(page, 15);
  await tapAt(page, 0.1, 0.5);

  await expectOnPage(page, 14);
});

test("turns no page with a tap once zones are off, though a swipe still turns", async ({
  page,
}) => {
  await openBookWith(page, { tapZones: "off" });

  await tapAt(page, 0.9, 0.5);
  await expectOnPage(page, 14);
  await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(0);
  await page.keyboard.press("ArrowRight");

  await expectOnPage(page, 15);
});

test("shows how the L-shaped zones work the first time", async ({ page }) => {
  await openBookWith(page, { tapZones: "lShape" }, [GUIDES_SEEN[0] ?? ""]);

  const guide = page.getByRole("note", { name: "Tap zones: L shape" });
  await expect(guide).toContainText(
    "Left and top go back; right and bottom go forward. The middle shows the controls.",
  );
  await guide.getByRole("button", { name: "Got it" }).click();

  await expect(guide).toHaveCount(0);
});

test("chooses the tap zones in Reading settings", async ({ page }) => {
  await openBookWith(page, {});
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();

  await page
    .getByRole("group", { name: "Tap zones" })
    .getByRole("radio", { name: "L shape" })
    .click();
  await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Previous page" })).toHaveCount(
    2,
  );
});

test("starts every series with the tap zones chosen in Settings › Reader", async ({
  page,
}) => {
  await page.goto("/settings/reading");
  await page
    .getByRole("radiogroup", { name: "Tap zones" })
    .getByRole("radio", { name: "Off" })
    .click();

  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    LOOK_KEY,
  );

  expect(JSON.parse(stored ?? "{}")).toMatchObject({ tapZones: "off" });
});
