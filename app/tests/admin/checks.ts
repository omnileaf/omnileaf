import { AxeBuilder } from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

import { sidewaysOverflow } from "../browser/sideways-overflow.ts";
import { expect } from "./fixtures.ts";
import { REPLY_ADDRESS, WIDE_LETTER_SPACING_EM } from "./samples.ts";

const TABLET_WIDTH = 768;
const PHONE_TARGET_PIXELS = 44;
const TABLET_TARGET_PIXELS = 24;
const MIN_OUTLINE_PIXELS = 2;
const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];
const TABBABLE =
  "a[href], button:not([disabled]), select:not([disabled]), input:not([type=hidden]):not([disabled]), textarea:not([disabled])";
const CONTROLS = "a[href], button, select, input:not([type=hidden]), textarea";

export function heading(page: Page): Locator {
  return page.getByRole("heading", { level: 1 });
}

export async function expectHeadingFocused(page: Page): Promise<void> {
  await expect(heading(page)).toBeFocused();
}

export async function expectHeadingNotFocused(page: Page): Promise<void> {
  await expect(heading(page)).not.toBeFocused();
}

export function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < TABLET_WIDTH;
}

export function countRequests(
  page: Page,
  matches: (url: URL, method: string) => boolean,
): () => number {
  let seen = 0;
  page.on("request", (request) => {
    if (matches(new URL(request.url()), request.method())) {
      seen += 1;
    }
  });
  return () => seen;
}

async function smallTargets(page: Page): Promise<string[]> {
  const skipLink = page.getByRole("link", { name: "Skip to the content" });
  const skipped =
    (await skipLink.count()) > 0 ? await skipLink.elementHandle() : null;
  return page.locator(CONTROLS).evaluateAll(
    (controls, { floor, skip }) =>
      controls.flatMap((control) => {
        const { width, height } = control.getBoundingClientRect();
        return !control.checkVisibility() ||
          control === skip ||
          (width >= floor && height >= floor)
          ? []
          : [
              `${control.outerHTML.slice(0, 80)} is ${String(width)}x${String(height)}`,
            ];
      }),
    {
      floor: isPhone(page) ? PHONE_TARGET_PIXELS : TABLET_TARGET_PIXELS,
      skip: skipped,
    },
  );
}

async function controlsWithoutFocusRing(page: Page): Promise<string[]> {
  const controls = page.locator(TABBABLE).filter({ visible: true });
  const count = await controls.count();
  const missing: string[] = [];
  await page.keyboard.press("Shift");
  for (let visited = 0; visited < count; visited += 1) {
    await controls.nth(visited).focus();
    const ring = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) {
        return null;
      }
      const style = getComputedStyle(active);
      return {
        control: active.outerHTML.slice(0, 80),
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth),
        color: style.outlineColor,
      };
    });
    if (
      ring === null ||
      ring.style === "none" ||
      ring.width < MIN_OUTLINE_PIXELS ||
      ring.color === "rgba(0, 0, 0, 0)"
    ) {
      missing.push(ring === null ? "nothing has focus" : ring.control);
    }
  }
  return missing;
}

export async function expectNoSidewaysOverflow(page: Page): Promise<void> {
  expect(await sidewaysOverflow(page, "body"), "sideways overflow").toEqual([]);
}

export async function expectTextWidened(page: Page): Promise<void> {
  const spacings = await page.evaluate(() =>
    ["body", "h1"].map((selector) => {
      const element = document.querySelector(selector);
      if (element === null) {
        return { selector, spacing: Number.NaN };
      }
      const style = getComputedStyle(element);
      return {
        selector,
        spacing:
          Number.parseFloat(style.letterSpacing) /
          Number.parseFloat(style.fontSize),
      };
    }),
  );
  for (const { selector, spacing } of spacings) {
    expect(spacing, `letter spacing in ems of ${selector}`).toBeCloseTo(
      WIDE_LETTER_SPACING_EM,
      2,
    );
  }
}

export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations, "axe violations").toEqual([]);
  await expectNoSidewaysOverflow(page);
  expect(await page.content(), "reply address in the page").not.toContain(
    REPLY_ADDRESS,
  );
  expect(
    await page.locator("body").innerText(),
    "reply address in the text",
  ).not.toContain(REPLY_ADDRESS);
  expect(await smallTargets(page), "small targets").toEqual([]);
  expect(
    await controlsWithoutFocusRing(page),
    "controls without a focus ring",
  ).toEqual([]);
}
