import type { Page } from "@playwright/test";

export interface HeldAnimation {
  readonly duration: number;
  readonly composite: string;
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
      const timing = typeof options === "object" ? options : {};
      window.heldAnimations?.push({
        duration: Number(timing.duration),
        composite: timing.composite ?? "replace",
      });
      return animation;
    };
  });
}

export function heldAnimations(page: Page): Promise<HeldAnimation[]> {
  return page.evaluate(() => window.heldAnimations ?? []);
}
