import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

const CONTROLS =
  "a[href], button, input, select, textarea, summary, [role=button], [role=checkbox], [role=switch], [role=tab], [role=radio]";
const POPUP_TRIGGERS =
  "[aria-haspopup]:not([aria-haspopup=false]), [data-slot=select-trigger]";
const MOST_CONTROLS_PER_SCREEN = 30;
const ACTION_TIMEOUT_MS = 2_000;
const STILL_TIMEOUT_MS = 3_000;
const MOVE_TOLERANCE_PX = 0.5;
const SHIFTS_NAMED_PER_HOVER = 3;
const NAME_LENGTH = 40;

declare global {
  interface Window {
    notedLayout?: Map<HTMLElement, readonly number[]>;
  }
}

function markOneControlPerLook(page: Page, controls: string): Promise<number> {
  return page.evaluate(
    ({ selector, most }) => {
      const looks = new Set<string>();
      for (const control of document.querySelectorAll<HTMLElement>(selector)) {
        const look = `${control.tagName} ${control.getAttribute("class") ?? ""}`;
        const { width, height } = control.getBoundingClientRect();
        const isHoverable =
          width > 0 &&
          height > 0 &&
          getComputedStyle(control).pointerEvents !== "none" &&
          control.closest("[aria-hidden=true], [inert]") === null;
        if (isHoverable && !looks.has(look) && looks.size < most) {
          control.dataset.layoutCheck = String(looks.size);
          looks.add(look);
        }
      }
      return looks.size;
    },
    { selector: controls, most: MOST_CONTROLS_PER_SCREEN },
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
          !wasDrawn(element) &&
          !["absolute", "fixed"].includes(getComputedStyle(element).position),
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

interface Interaction {
  readonly controls: string;
  readonly verb: string;
  readonly act: (control: Locator) => Promise<void>;
  readonly undo: (page: Page) => Promise<void>;
}

async function shiftsWhile(
  page: Page,
  { controls, verb, act, undo }: Interaction,
): Promise<string[]> {
  await page.evaluate(() => {
    for (const marked of document.querySelectorAll<HTMLElement>(
      "[data-layout-check]",
    )) {
      delete marked.dataset.layoutCheck;
    }
  });
  const count = await markOneControlPerLook(page, controls);
  const problems: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const control = page.locator(`[data-layout-check="${String(index)}"]`);
    const isReady = await control
      .scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (isReady) {
      await page.mouse.move(0, 0);
      await waitUntilStill(page);
      await noteLayout(page);
      const name = await control.evaluate(
        (element, nameLength) =>
          `${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, nameLength)}"`,
        NAME_LENGTH,
      );
      const isDone = await act(control)
        .then(() => true)
        .catch(() => false);
      await waitUntilStill(page);
      const shifts = isDone ? await shiftsSinceNoted(page) : [];
      if (shifts.length > 0) {
        problems.push(`${verb} ${name} moves ${shifts.join("; ")}`);
      }
      await undo(page);
      await waitUntilStill(page);
    }
  }
  return problems;
}

/** Hovers one control of each look on the screen and names whatever moves or resizes, judged by layout boxes so a lift or fade passes, and leaving out what only makes room for something the hover reveals. */
export function shiftsOnHover(page: Page): Promise<string[]> {
  return shiftsWhile(page, {
    controls: CONTROLS,
    verb: "hovering",
    act: (control) => control.hover({ timeout: ACTION_TIMEOUT_MS }),
    undo: (shown) => shown.mouse.move(0, 0),
  });
}

/** Opens each menu, list and popover on the screen and names whatever moves behind it, such as a page that loses its scrollbar. */
export function shiftsOnOpening(page: Page): Promise<string[]> {
  return shiftsWhile(page, {
    controls: POPUP_TRIGGERS,
    verb: "opening",
    act: (control) => control.click({ timeout: ACTION_TIMEOUT_MS }),
    undo: (shown) => shown.keyboard.press("Escape"),
  });
}
