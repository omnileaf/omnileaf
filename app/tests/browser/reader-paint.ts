import type { Page } from "@playwright/test";

declare global {
  interface Window {
    omnileafBarePages?: string[];
    omnileafRecordingBarePages?: boolean;
    omnileafLateDecodes?: Record<string, number>;
    omnileafRefusedDecodes?: Set<string>;
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
      if (window.omnileafRefusedDecodes?.has(this.alt) === true) {
        throw new DOMException(
          "The source image cannot be decoded.",
          "EncodingError",
        );
      }
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

export async function refuseDecodes(
  page: Page,
  numbers: readonly number[],
): Promise<void> {
  await page.addInitScript((alts) => {
    window.omnileafRefusedDecodes = new Set(alts);
  }, numbers.map(pageAlt));
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
    const EDGE_PX = 1;
    const isVisible = (element: Element | null | undefined): boolean =>
      element?.checkVisibility({ visibilityProperty: true }) === true;
    const isClear = (element: Element): boolean =>
      /(,|\/)\s*0\)$|^transparent$/.test(
        getComputedStyle(element).backgroundColor,
      );
    const covers = (outer: DOMRect, inner: DOMRect): boolean =>
      outer.left <= inner.left + EDGE_PX &&
      outer.right >= inner.right - EDGE_PX &&
      outer.top <= inner.top + EDGE_PX &&
      outer.bottom >= inner.bottom - EDGE_PX;
    const hasPageColourUnder = (pageBox: HTMLElement): boolean =>
      !isClear(pageBox) ||
      [...pageBox.querySelectorAll(":scope > [data-page-loading]")].some(
        (layer) =>
          isVisible(layer) &&
          !isClear(layer) &&
          covers(
            layer.getBoundingClientRect(),
            pageBox.getBoundingClientRect(),
          ),
      );
    const isDrawn = (image: HTMLImageElement): boolean =>
      isVisible(image) &&
      image.complete &&
      image.naturalWidth > 0 &&
      window.omnileafPendingDecodes?.has(image.alt) !== true;
    const record = (): void => {
      if (window.omnileafRecordingBarePages !== true) {
        return;
      }
      const area = document
        .querySelector("[data-shown-page]")
        ?.getBoundingClientRect();
      if (area !== undefined) {
        const bare = [
          ...document.querySelectorAll<HTMLImageElement>(
            'main img[alt^="Page "]',
          ),
        ]
          .filter((image) => {
            const box = image.parentElement?.getBoundingClientRect();
            return (
              box !== undefined &&
              box.width > 0 &&
              box.right > area.left + EDGE_PX &&
              box.left < area.right - EDGE_PX
            );
          })
          .filter((image) => {
            const pageBox = image.parentElement;
            return (
              pageBox === null ||
              !isVisible(pageBox) ||
              !(hasPageColourUnder(pageBox) || isDrawn(image))
            );
          })
          .map((image) => image.alt);
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
