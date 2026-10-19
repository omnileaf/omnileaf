import type { Locator, Page } from "@playwright/test";

import { boxOf, expect, test } from "./fixtures.ts";

const GROUP_GAP_PX = 24;
const INTRO_GAP_PX = 8;

function cards(page: Page): Locator[] {
  return [
    page
      .getByRole("combobox", { name: "Reading mode for new series" })
      .locator("xpath=ancestor::section[1]"),
    page.getByRole("region", { name: "Tap zones" }),
    page.getByRole("region", { name: "End of a book" }),
    page.getByRole("region", { name: "Smart features" }),
  ];
}

async function fontSizeOf(element: Locator): Promise<string> {
  return element.evaluate((node) => getComputedStyle(node).fontSize);
}

test("shows up next at the end of a book until Skip Up next is turned on, and remembers it", async ({
  page,
}) => {
  await page.goto("/settings/reading");
  const skip = page.getByRole("switch", { name: "Skip Up next" });
  await expect(skip).not.toBeChecked();

  await skip.click();
  await page.reload();

  await expect(
    page.getByRole("switch", { name: "Skip Up next" }),
  ).toBeChecked();
});

test("lists Reader among the settings sections", async ({ page }) => {
  await page.goto("/settings");

  await page
    .getByRole("link", { name: /^Reader/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/settings\/reading$/);
});

test("sets its cards 24px apart, the first 8px under the intro", async ({
  page,
}) => {
  await page.goto("/settings/reading");
  const intro = await boxOf(
    page.getByText("Defaults for every series without its own."),
  );
  const boxes = await Promise.all(cards(page).map((card) => boxOf(card)));

  const gaps: number[] = [];
  let above = intro;
  for (const box of boxes) {
    gaps.push(Math.round(box.y - (above.y + above.height)));
    above = box;
  }
  expect(gaps).toEqual([
    INTRO_GAP_PX,
    GROUP_GAP_PX,
    GROUP_GAP_PX,
    GROUP_GAP_PX,
  ]);
});

test("sets Smart features in the same type as the cards above it", async ({
  page,
}) => {
  await page.goto("/settings/reading");

  expect(
    await fontSizeOf(page.getByRole("heading", { name: "Smart features" })),
  ).toBe(
    await fontSizeOf(page.getByRole("heading", { name: "End of a book" })),
  );
  expect(
    await fontSizeOf(
      page
        .getByRole("region", { name: "Smart features" })
        .getByText("Learn my reading speed"),
    ),
  ).toBe(await fontSizeOf(page.getByText("Skip Up next", { exact: true })));
});

test("stretches the tap zones across their card", async ({ page }) => {
  await page.goto("/settings/reading");
  const card = await boxOf(page.getByRole("region", { name: "Tap zones" }));
  const zones = await boxOf(
    page.getByRole("radiogroup", { name: "Tap zones" }),
  );

  expect(zones.width).toBeGreaterThan(card.width * 0.9);
});
