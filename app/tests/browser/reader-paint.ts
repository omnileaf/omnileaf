import type { Page } from "@playwright/test";

declare global {
  interface Window {
    omnileafBarePages?: string[];
    omnileafRecordingBarePages?: boolean;
    omnileafLateDecodes?: Record<string, number>;
    omnileafPendingDecodes?: Set<string>;
    omnileafDecodedAt?: Record<string, number>;
    omnileafMovedAt?: number | undefined;
    omnileafSpinnerFrames?: number;
    omnileafRecordingSpinners?: boolean;
  }
}

export function pageAlt(number: number): string {
  return `Page ${String(number)}`;
}

export async function letDecodesRunLate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.omnileafLateDecodes = {};
    window.omnileafPendingDecodes = new Set();
    window.omnileafDecodedAt = {};
    const { decode } = HTMLImageElement.prototype as {
      decode: (this: HTMLImageElement) => Promise<void>;
    };
    HTMLImageElement.prototype.decode = async function late(
      this: HTMLImageElement,
    ): Promise<void> {
      const lateMs = window.omnileafLateDecodes?.[this.alt];
      if (lateMs === undefined) {
        return decode.call(this);
      }
      const alt = this.alt;
      window.omnileafPendingDecodes?.add(alt);
      try {
        await decode.call(this);
        await new Promise((decoded) => setTimeout(decoded, lateMs));
      } finally {
        window.omnileafPendingDecodes?.delete(alt);
        if (window.omnileafDecodedAt !== undefined) {
          window.omnileafDecodedAt[alt] = performance.now();
        }
      }
    };
  });
}

export async function decodeLate(
  page: Page,
  numbers: readonly number[],
  lateMs: number,
): Promise<void> {
  await page.evaluate(
    ({ alts, ms }) => {
      for (const alt of alts) {
        if (window.omnileafLateDecodes !== undefined) {
          window.omnileafLateDecodes[alt] = ms;
        }
      }
    },
    { alts: numbers.map(pageAlt), ms: lateMs },
  );
}

export async function decodedAt(
  page: Page,
  number: number,
): Promise<number | undefined> {
  return page.evaluate(
    (alt) => window.omnileafDecodedAt?.[alt],
    pageAlt(number),
  );
}

export async function recordBarePages(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.omnileafBarePages = [];
    window.omnileafRecordingBarePages = true;
    const isVisible = (element: Element | null | undefined): boolean =>
      element?.checkVisibility({ visibilityProperty: true }) === true;
    const isPainted = (image: HTMLImageElement): boolean =>
      image.hasAttribute("data-decoded") &&
      window.omnileafPendingDecodes?.has(image.alt) !== true;
    const record = (): void => {
      if (window.omnileafRecordingBarePages !== true) {
        return;
      }
      const area = document
        .querySelector("[data-shown-page]")
        ?.getBoundingClientRect();
      if (area !== undefined) {
        const overlay = document.querySelector('main [role="status"] p');
        const overlayLoading = isVisible(overlay)
          ? overlay?.textContent.trim()
          : undefined;
        const bare = [
          ...document.querySelectorAll<HTMLElement>("main [data-turns]"),
        ]
          .filter((cell) => {
            const box = cell.getBoundingClientRect();
            return (
              isVisible(cell) &&
              box.right > area.left + 1 &&
              box.left < area.right - 1
            );
          })
          .flatMap((cell) => {
            const isResting =
              cell.dataset.turns === "0" && cell.style.translate === "";
            return [
              ...cell.querySelectorAll<HTMLImageElement>('img[alt^="Page "]'),
            ]
              .filter(
                (image) =>
                  !isPainted(image) &&
                  !isVisible(
                    image.parentElement?.querySelector("[data-page-loading]"),
                  ) &&
                  !(
                    isResting &&
                    overlayLoading === `Loading ${image.alt.toLowerCase()}`
                  ),
              )
              .map((image) => image.alt);
          });
        if (bare.length > 0) {
          window.omnileafBarePages?.push(bare.join(", "));
        }
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}

export async function stopRecordingBarePages(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    window.omnileafRecordingBarePages = false;
    return window.omnileafBarePages ?? [];
  });
}

export async function recordFirstMotion(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.omnileafMovedAt = undefined;
    const watch = (): void => {
      const isSliding = document
        .getAnimations()
        .some(
          (animation) =>
            animation.effect instanceof KeyframeEffect &&
            animation.effect
              .getKeyframes()
              .some((frame) => "translate" in frame),
        );
      if (isSliding) {
        window.omnileafMovedAt = performance.now();
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}

export async function firstMotionAt(page: Page): Promise<number | undefined> {
  return page.evaluate(() => window.omnileafMovedAt);
}

export async function recordSpinners(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.omnileafSpinnerFrames = 0;
    window.omnileafRecordingSpinners = true;
    const record = (): void => {
      if (window.omnileafRecordingSpinners !== true) {
        return;
      }
      const isSpinning = [
        ...document.querySelectorAll("main [data-page-loading] > *"),
      ].some((part) => part.checkVisibility({ visibilityProperty: true }));
      if (isSpinning) {
        window.omnileafSpinnerFrames = (window.omnileafSpinnerFrames ?? 0) + 1;
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}

export async function stopRecordingSpinners(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.omnileafRecordingSpinners = false;
    return window.omnileafSpinnerFrames ?? 0;
  });
}
