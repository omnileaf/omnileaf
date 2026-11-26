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
  sheetBackShape,
} from "./sheet-back";

type Phase = "held" | "cancelling";

const AT_REST: SheetBackShape = { scaleX: 1, scaleY: 1, contentScaleY: 1 };
const SHEETS_STILL = "sheets";
const SPRING_BACK = `scale ${String(ANDROID_BACK_SPRING.durationMs)}ms ${ANDROID_BACK_SPRING.easing}`;
const FOLLOWING_FINGER = "translate, transform, rotate";

export function isSheetMotionOn(): boolean {
  const still = document.documentElement.dataset.still ?? "";
  return (
    !prefersReducedMotion.current && !still.split(" ").includes(SHEETS_STILL)
  );
}

function styleOf(shape: SheetBackShape, phase: Phase): string {
  const placed = [
    "transform-origin: 50% 100%",
    `scale: ${String(shape.scaleX)} ${String(shape.scaleY)}`,
    `--sheet-back-content: ${String(shape.contentScaleY)}`,
  ];
  switch (phase) {
    case "held":
      return [...placed, `transition-property: ${FOLLOWING_FINGER}`].join("; ");
    case "cancelling":
      return [
        ...placed,
        `transition: ${SPRING_BACK}`,
        `--sheet-back-settle: ${SPRING_BACK}`,
      ].join("; ");
    default:
      return assertNever(phase);
  }
}

export class SheetBackPreview {
  #phase: Phase | undefined = $state();
  #shape: SheetBackShape = $state.raw(AT_REST);
  #size: SheetBackSize | undefined;
  #stopSettling: (() => void) | undefined;
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
    return this.#phase === undefined
      ? undefined
      : styleOf(this.#shape, this.#phase);
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
    this.#scheduler.nextFrame(() => {
      if (this.#sheet()?.dataset.state === "open") {
        this.#springBack();
      }
    });
  }

  #hold(): void {
    const sheet = this.#sheet();
    if (sheet === null || !this.#isMotionOn()) {
      return;
    }
    this.#stopSettling?.();
    this.#size = { width: sheet.offsetWidth, height: sheet.offsetHeight };
    this.#shape = AT_REST;
    this.#phase = "held";
  }

  #shrink(progress: number): void {
    if (this.#phase !== "held" || this.#size === undefined) {
      return;
    }
    this.#shape = sheetBackShape(this.#size, easedBackProgress(progress));
  }

  #springBack(): void {
    if (this.#phase !== "held") {
      return;
    }
    this.#shape = AT_REST;
    this.#phase = "cancelling";
    this.#stopSettling = this.#scheduler.after(
      ANDROID_BACK_SPRING.durationMs,
      () => {
        this.#phase = undefined;
      },
    );
  }
}
