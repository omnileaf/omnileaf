import type { Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

const CONTROLS =
  "a[href], button, input, select, textarea, summary, [role=button], [role=checkbox], [role=switch], [role=tab], [role=radio]";
const MOST_HOVERED_PER_SCREEN = 30;
const HOVER_TIMEOUT_MS = 2_000;
const STILL_TIMEOUT_MS = 3_000;
const MOVE_TOLERANCE_PX = 0.5;
const SHIFTS_NAMED_PER_HOVER = 3;
const NAME_LENGTH = 40;

declare global {
  interface Window {
    notedLayout?: Map<HTMLElement, readonly number[]>;
  }
}

function markOneControlPerLook(page: Page): Promise<number> {
  return page.evaluate(
    ({ controls, most }) => {
      const looks = new Set<string>();
      for (const control of document.querySelectorAll<HTMLElement>(controls)) {
        const look = `${control.tagName} ${control.getAttribute("class") ?? ""}`;
        const { width, height } = control.getBoundingClientRect();
        const isHoverable =
          width > 0 &&
          height > 0 &&
          getComputedStyle(control).pointerEvents !== "none" &&
          control.closest("[aria-hidden=true], [inert]") === null;
        if (isHoverable && !looks.has(look) && looks.size < most) {
          control.dataset.hoverCheck = String(looks.size);
          looks.add(look);
        }
      }
      return looks.size;
    },
    { controls: CONTROLS, most: MOST_HOVERED_PER_SCREEN },
  );
}

function noteLayout(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.notedLayout = new Map(
      [...document.body.querySelectorAll<HTMLElement>("*")]
        .filter((element) => element instanceof HTMLElement)
        .map((element) => [
          element,
          [
            element.offsetLeft,
            element.offsetTop,
            element.offsetWidth,
            element.offsetHeight,
          ],
        ]),
    );
  });
}

function shiftsSinceNoted(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ tolerance, most, nameLength }) => {
      const nameOf = (element: HTMLElement): string => {
        const words = element.getAttribute("aria-label") ?? element.textContent;
        const classes = [...element.classList].slice(0, 3).join(".");
        return `${element.tagName.toLowerCase()}.${classes} "${words.trim().slice(0, nameLength)}"`;
      };
      const noted = window.notedLayout ?? new Map<HTMLElement, number[]>();
      const isDrawn = (element: HTMLElement): boolean =>
        element.offsetWidth > 0 && element.offsetHeight > 0;
      const wasDrawn = (element: HTMLElement): boolean => {
        const [, , width = 0, height = 0] = noted.get(element) ?? [];
        return width > 0 && height > 0;
      };
      const appeared = [
        ...document.body.querySelectorAll<HTMLElement>("*"),
      ].filter(
        (element) =>
          element instanceof HTMLElement &&
          isDrawn(element) &&
          !wasDrawn(element),
      );
      const makesRoomForAppeared = (element: HTMLElement): boolean =>
        appeared.some(
          (shown) =>
            element.contains(shown) ||
            shown.parentElement?.contains(element) === true,
        );
      const shifts: string[] = [];
      for (const [element, before] of noted) {
        const after = [
          element.offsetLeft,
          element.offsetTop,
          element.offsetWidth,
          element.offsetHeight,
        ];
        const moved = after.some(
          (value, index) => Math.abs(value - (before[index] ?? 0)) > tolerance,
        );
        if (
          element.isConnected &&
          wasDrawn(element) &&
          isDrawn(element) &&
          moved &&
          !makesRoomForAppeared(element)
        ) {
          shifts.push(
            `${nameOf(element)} ${before.join(",")} → ${after.join(",")}`,
          );
        }
      }
      return shifts.slice(0, most);
    },
    {
      tolerance: MOVE_TOLERANCE_PX,
      most: SHIFTS_NAMED_PER_HOVER,
      nameLength: NAME_LENGTH,
    },
  );
}

async function waitUntilStill(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.playState === "running" &&
                  animation.effect?.getComputedTiming().iterations !== Infinity,
              ).length,
        ),
      { timeout: STILL_TIMEOUT_MS },
    )
    .toBe(0)
    .catch(() => undefined);
}

/** Hovers one control of each look on the screen and names whatever moves or resizes, judged by layout boxes so a lift or fade passes, and leaving out what only makes room for something the hover reveals. */
export async function shiftsOnHover(page: Page): Promise<string[]> {
  const count = await markOneControlPerLook(page);
  const problems: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const control = page.locator(`[data-hover-check="${String(index)}"]`);
    const isReady = await control
      .scrollIntoViewIfNeeded({ timeout: HOVER_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (isReady) {
      await page.mouse.move(0, 0);
      await waitUntilStill(page);
      await noteLayout(page);
      const isHovered = await control
        .hover({ timeout: HOVER_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false);
      await waitUntilStill(page);
      const shifts = isHovered ? await shiftsSinceNoted(page) : [];
      if (shifts.length > 0) {
        const name = await control.evaluate(
          (element, nameLength) =>
            `${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, nameLength)}"`,
          NAME_LENGTH,
        );
        problems.push(`hovering ${name} moves ${shifts.join("; ")}`);
      }
    }
  }
  return problems;
}
