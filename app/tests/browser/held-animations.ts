import type { Page } from "@playwright/test";

export interface HeldAnimation {
  readonly duration: number;
}

declare global {
  interface Window {
    heldAnimations?: HeldAnimation[];
  }
}

export async function holdScriptedAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const { animate } = Element.prototype as {
      animate: (
        this: Element,
        ...args: Parameters<Element["animate"]>
      ) => Animation;
    };
    window.heldAnimations = [];
    Element.prototype.animate = function held(keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      animation.pause();
      const timing =
        typeof options === "number" ? { duration: options } : (options ?? {});
      window.heldAnimations?.push({ duration: Number(timing.duration) });
      return animation;
    };
  });
}

export function heldAnimations(page: Page): Promise<HeldAnimation[]> {
  return page.evaluate(() => window.heldAnimations ?? []);
}

export async function slowMoves(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `:root, :root * { --native-duration-move: ${String(SLOW_MOVE_MS)}ms !important; }`,
  });
}

export const SLOW_MOVE_MS = 100_000;
