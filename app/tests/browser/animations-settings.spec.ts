import type { Locator, Page } from "@playwright/test";

import { accessibilityViolations, expect, test } from "./fixtures.ts";

const GROUPS = [
  "Navigation",
  "Sheets and menus",
  "Reader controls",
  "Loading and progress",
] as const;

async function openAnimations(page: Page): Promise<void> {
  await page.goto("/settings/advanced");
  await page.getByRole("link", { name: "Animations" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Animations" }),
  ).toBeVisible();
}

function stillGroups(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.documentElement.dataset.still);
}

function iconOffsetFromFirstGlyph(note: Locator): Promise<number> {
  return note.evaluate((paragraph) => {
    const icon = paragraph.querySelector("svg");
    if (icon === null) {
      throw new Error("the note has no icon");
    }
    const middle = (box: DOMRect) => box.top + box.height / 2;
    const texts = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node !== null; node = texts.nextNode()) {
      const start = node.textContent?.search(/\S/) ?? -1;
      if (start >= 0) {
        const glyph = document.createRange();
        glyph.setStart(node, start);
        glyph.setEnd(node, start + 1);
        return (
          middle(icon.getBoundingClientRect()) -
          middle(glyph.getBoundingClientRect())
        );
      }
    }
    throw new Error("the note shows no text");
  });
}

test("plays every group of movement until one is switched off", async ({
  page,
}) => {
  await openAnimations(page);

  for (const group of GROUPS) {
    await expect(page.getByRole("switch", { name: group })).toBeChecked();
  }
  expect(await stillGroups(page)).toBeUndefined();
});

test("holds a group still at once, and keeps it so", async ({ page }) => {
  await openAnimations(page);

  await page.getByRole("switch", { name: "Loading and progress" }).click();

  await expect.poll(() => stillGroups(page)).toBe("loading");
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Loading and progress" }),
  ).not.toBeChecked();
  await expect.poll(() => stillGroups(page)).toBe("loading");
});

test("turns spinners at half speed with Loading and progress off", async ({
  page,
}) => {
  await openAnimations(page);
  const spin = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--transition-duration-spin")
        .trim(),
    );
  const turning = await spin();

  await page.getByRole("switch", { name: "Loading and progress" }).click();

  await expect.poll(spin).not.toBe(turning);
});

test("opens sheets and menus without moving with Sheets and menus off", async ({
  page,
}) => {
  await openAnimations(page);
  const fadeDuration = () =>
    page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "fade-motion";
      document.body.append(probe);
      const duration = getComputedStyle(probe).transitionDuration;
      probe.remove();
      return duration;
    });
  const moving = await fadeDuration();

  await page.getByRole("switch", { name: "Sheets and menus" }).click();

  expect(moving).not.toBe("0s");
  await expect.poll(fadeDuration).toBe("0s");
});

test("centres the Reduce motion note's icon on its first line", async ({
  page,
}) => {
  await openAnimations(page);
  const note = page.locator("main p", { has: page.locator("svg") });

  const offset = await iconOffsetFromFirstGlyph(note);

  expect(Math.abs(offset)).toBeLessThanOrEqual(1);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Animations has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openAnimations(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
