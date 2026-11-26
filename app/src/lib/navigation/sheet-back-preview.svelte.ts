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

type Phase = "held" | "cancelling";

const AT_REST: SheetBackShape = { scaleX: 1, scaleY: 1, contentScaleY: 1 };
const REST_SCALE = "1 1";
const SHEETS_STILL = "sheets";
const FOLLOWING_FINGER = "translate, transform, rotate";
const PART_ORIGIN = "--sheet-back-origin";

export function isSheetMotionOn(): boolean {
  const still = document.documentElement.dataset.still ?? "";
  return (
    !prefersReducedMotion.current && !still.split(" ").includes(SHEETS_STILL)
  );
}

function styleOf(shape: SheetBackShape): string {
  return [
    "transform-origin: 50% 100%",
    `scale: ${String(shape.scaleX)} ${String(shape.scaleY)}`,
    `--sheet-back-content: ${String(shape.contentScaleY)}`,
    `transition-property: ${FOLLOWING_FINGER}`,
  ].join("; ");
}

function shapeReachedBy(sheet: HTMLElement): SheetBackShape {
  const [scaleX = 1, scaleY = scaleX] = getComputedStyle(sheet)
    .scale.split(" ")
    .map(Number)
    .filter((value) => !Number.isNaN(value));
  return { scaleX, scaleY, contentScaleY: scaleX / scaleY };
}

function partsOf(sheet: HTMLElement): readonly HTMLElement[] {
  return [...sheet.children].filter(
    (part): part is HTMLElement => part instanceof HTMLElement,
  );
}

function springBackOf(element: HTMLElement): Animation {
  return element.animate(
    [{ scale: getComputedStyle(element).scale }, { scale: REST_SCALE }],
    {
      duration: ANDROID_BACK_SPRING.durationMs,
      easing: ANDROID_BACK_SPRING.easing,
    },
  );
}

export class SheetBackPreview {
  #phase: Phase | undefined = $state();
  #shape: SheetBackShape = $state.raw(AT_REST);
  #size: SheetBackSize | undefined;
  #reached = 0;
  #watching: MutationObserver | undefined;
  #parts: readonly HTMLElement[] = [];
  #springs: readonly Animation[] = [];
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
    return this.#phase === undefined ? undefined : styleOf(this.#shape);
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
    const reached = this.#phase === undefined ? AT_REST : shapeReachedBy(sheet);
    this.#release();
    this.#size = { width: sheet.offsetWidth, height: sheet.offsetHeight };
    this.#reached = sheetBackProgressOf(this.#size, reached);
    this.#watching = new MutationObserver(() => {
      if (sheet.dataset.state === "open") {
        this.#release();
      }
    });
    this.#watching.observe(sheet, {
      attributes: true,
      attributeFilter: ["data-state"],
    });
    this.#parts = partsOf(sheet);
    for (const part of this.#parts) {
      part.style.setProperty(PART_ORIGIN, `${String(-part.offsetTop)}px`);
    }
    this.#shape = reached;
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
    if (this.#phase !== "held" || sheet === null) {
      return;
    }
    this.#springs = [sheet, ...this.#parts].map(springBackOf);
    this.#shape = AT_REST;
    this.#phase = "cancelling";
    this.#stopSettling = this.#scheduler.after(
      ANDROID_BACK_SPRING.durationMs,
      () => {
        this.#release();
      },
    );
  }

  #release(): void {
    this.#stopSettling?.();
    this.#stopSettling = undefined;
    this.#stopChecking?.();
    this.#stopChecking = undefined;
    for (const spring of this.#springs) {
      spring.cancel();
    }
    this.#springs = [];
    for (const part of this.#parts) {
      part.style.removeProperty(PART_ORIGIN);
    }
    this.#parts = [];
    this.#watching?.disconnect();
    this.#watching = undefined;
    this.#size = undefined;
    this.#reached = 0;
    this.#shape = AT_REST;
    this.#phase = undefined;
  }
}
