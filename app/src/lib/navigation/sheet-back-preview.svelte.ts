import { prefersReducedMotion } from "svelte/motion";

import { assertNever } from "#lib/assert-never.ts";

import {
  BROWSER_SCHEDULER,
  type PreviewScheduler,
} from "./android-back-preview.svelte";
import { easedBackProgress } from "./back-progress";
import { ANDROID_BACK_SPRING, type BackGestureStep } from "./back-preview";
import {
  type SheetBackShape,
  type SheetBackSize,
  sheetBackProgressOf,
  sheetBackShape,
} from "./sheet-back";

type Phase = "held" | "cancelling" | "resetting";

interface ScrolledPart {
  readonly part: HTMLElement;
  readonly scrollTop: number;
}

const NO_SHAPE: SheetBackShape = { scale: 1, layoutHeight: 0 };
const REST_SCALE = "1";
const SHEETS_STILL = "sheets";
const FOLLOWING_FINGER = "translate, transform, rotate";

export function isSheetMotionOn(): boolean {
  const still = document.documentElement.dataset.still ?? "";
  return (
    !prefersReducedMotion.current && !still.split(" ").includes(SHEETS_STILL)
  );
}

function resettingStyle(): string {
  return [
    `scale: ${REST_SCALE}`,
    `transition-property: ${FOLLOWING_FINGER}`,
  ].join("; ");
}

function scrolledPartsOf(sheet: HTMLElement): readonly ScrolledPart[] {
  return [...sheet.children]
    .filter((part): part is HTMLElement => part instanceof HTMLElement)
    .filter(
      (part) =>
        ["auto", "scroll"].includes(getComputedStyle(part).overflowY) &&
        part.scrollHeight > part.clientHeight,
    )
    .map((part) => ({ part, scrollTop: part.scrollTop }));
}

function fillableHeightOf(parts: readonly ScrolledPart[]): number {
  return parts.reduce(
    (total, { part }) => total + part.scrollHeight - part.clientHeight,
    0,
  );
}

function styleOf(shape: SheetBackShape): string {
  return [
    "transform-origin: 50% 100%",
    `scale: ${String(shape.scale)}`,
    `block-size: ${String(shape.layoutHeight)}px`,
    "max-block-size: none",
    "inset-block-start: auto",
    `transition-property: ${FOLLOWING_FINGER}`,
  ].join("; ");
}

function scaleReachedBy(sheet: HTMLElement): number {
  const [scale = 1] = getComputedStyle(sheet)
    .scale.split(" ")
    .map(Number)
    .filter((value) => !Number.isNaN(value));
  return scale;
}

function springBackOf(sheet: HTMLElement, restHeight: number): Animation {
  const reached = getComputedStyle(sheet);
  return sheet.animate(
    [
      { scale: reached.scale, blockSize: reached.blockSize },
      { scale: REST_SCALE, blockSize: `${String(restHeight)}px` },
    ],
    {
      duration: ANDROID_BACK_SPRING.durationMs,
      easing: ANDROID_BACK_SPRING.easing,
    },
  );
}

export class SheetBackPreview {
  #phase: Phase | undefined = $state();
  #shape: SheetBackShape = $state.raw(NO_SHAPE);
  #size: SheetBackSize | undefined;
  #reached = 0;
  #scrolled: readonly ScrolledPart[] = [];
  #stopFollowingScroll: (() => void) | undefined;
  #stopResetting: (() => void) | undefined;
  #watching: MutationObserver | undefined;
  #spring: Animation | undefined;
  #stopSettling: (() => void) | undefined;
  #stopChecking: (() => void) | undefined;
  readonly #sheet: () => HTMLElement | null;
  readonly #isMotionOn: () => boolean;
  readonly #scheduler: PreviewScheduler;

  constructor(
    sheet: () => HTMLElement | null,
    isMotionOn: () => boolean = isSheetMotionOn,
    scheduler: PreviewScheduler = BROWSER_SCHEDULER,
  ) {
    this.#sheet = sheet;
    this.#isMotionOn = isMotionOn;
    this.#scheduler = scheduler;
  }

  get phase(): Phase | undefined {
    return this.#phase;
  }

  get style(): string | undefined {
    switch (this.#phase) {
      case undefined:
        return undefined;
      case "resetting":
        return resettingStyle();
      case "held":
      case "cancelling":
        return styleOf(this.#shape);
      default:
        return assertNever(this.#phase);
    }
  }

  follow(step: BackGestureStep): void {
    switch (step.kind) {
      case "started":
        this.#hold();
        return;
      case "moved":
        this.#shrink(step.at.progress);
        return;
      case "ended":
        this.#springBack();
        return;
      default:
        assertNever(step);
    }
  }

  closed(): void {
    this.#stopChecking?.();
    this.#stopChecking = this.#scheduler.nextFrame(() => {
      if (this.#sheet()?.dataset.state === "open") {
        this.#springBack();
      }
    });
  }

  gone(): void {
    this.#release();
  }

  #hold(): void {
    const sheet = this.#sheet();
    if (sheet === null || !this.#isMotionOn()) {
      return;
    }
    const scrolled =
      this.#size === undefined ? scrolledPartsOf(sheet) : this.#scrolled;
    const size = this.#size ?? {
      width: sheet.offsetWidth,
      height: sheet.offsetHeight,
      fillableHeight: fillableHeightOf(scrolled),
    };
    const reached =
      this.#phase === undefined
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              sheetBackProgressOf(size, {
                scale: scaleReachedBy(sheet),
                layoutHeight: size.height,
              }),
            ),
          );
    this.#release();
    this.#size = size;
    this.#scrolled = scrolled;
    this.#reached = reached;
    this.#watching = new MutationObserver(() => {
      if (sheet.dataset.state === "open") {
        this.#reopen();
      }
    });
    this.#watching.observe(sheet, {
      attributes: true,
      attributeFilter: ["data-state"],
    });
    this.#shape = sheetBackShape(size, reached);
    this.#phase = "held";
  }

  #shrink(progress: number): void {
    if (this.#phase !== "held" || this.#size === undefined) {
      return;
    }
    const eased = easedBackProgress(progress);
    this.#shape = sheetBackShape(
      this.#size,
      this.#reached + (1 - this.#reached) * eased,
    );
  }

  #springBack(): void {
    const sheet = this.#sheet();
    if (this.#phase !== "held" || sheet === null || this.#size === undefined) {
      return;
    }
    this.#spring = springBackOf(sheet, this.#size.height);
    this.#shape = sheetBackShape(this.#size, 0);
    this.#phase = "cancelling";
    this.#followScroll();
    this.#stopSettling = this.#scheduler.after(
      ANDROID_BACK_SPRING.durationMs,
      () => {
        this.#release();
      },
    );
  }

  #followScroll(): void {
    this.#restoreScroll();
    this.#stopFollowingScroll = this.#scheduler.nextFrame(() => {
      this.#followScroll();
    });
  }

  #restoreScroll(): void {
    for (const { part, scrollTop } of this.#scrolled) {
      part.scrollTop = Math.min(
        scrollTop,
        part.scrollHeight - part.clientHeight,
      );
    }
  }

  #reopen(): void {
    this.#release();
    this.#phase = "resetting";
    this.#stopResetting = this.#scheduler.nextFrame(() => {
      this.#phase = undefined;
    });
  }

  #release(): void {
    this.#restoreScroll();
    this.#stopFollowingScroll?.();
    this.#stopFollowingScroll = undefined;
    this.#stopResetting?.();
    this.#stopResetting = undefined;
    this.#scrolled = [];
    this.#stopSettling?.();
    this.#stopSettling = undefined;
    this.#stopChecking?.();
    this.#stopChecking = undefined;
    this.#spring?.cancel();
    this.#spring = undefined;
    this.#watching?.disconnect();
    this.#watching = undefined;
    this.#size = undefined;
    this.#reached = 0;
    this.#shape = NO_SHAPE;
    this.#phase = undefined;
  }
}
