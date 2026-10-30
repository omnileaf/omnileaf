import { toast } from "svelte-sonner";

import { focusPageHeading } from "#lib/navigation/page-heading.ts";

import type { Notices } from "./notices";

export class NoticeRegion {
  element: HTMLElement | undefined;
  #cameFrom: HTMLElement | undefined;
  #isPointerOver = $state(false);
  #isFocusWithin = $state(false);
  #isTapped = $state(false);
  readonly #notices: Notices;

  constructor(notices: Notices) {
    this.#notices = notices;

    $effect(() => {
      if (toast.getActiveToasts().length === 0) {
        this.#isPointerOver = false;
        this.#isFocusWithin = false;
        this.#isTapped = false;
      }
    });

    $effect(() => {
      if (this.isSpread) {
        notices.hold();
      } else {
        notices.release();
      }
    });
  }

  get isSpread(): boolean {
    return this.#isPointerOver || this.#isFocusWithin || this.#isTapped;
  }

  #isInside(target: EventTarget | null): boolean {
    return target instanceof Node && this.element?.contains(target) === true;
  }

  noteFocusArriving = (event: FocusEvent): void => {
    this.#isFocusWithin = true;
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !this.#isInside(from)) {
      this.#cameFrom = from;
    }
  };

  noteFocusLeaving = (event: FocusEvent): void => {
    if (!this.#isInside(event.relatedTarget)) {
      this.#isFocusWithin = false;
    }
  };

  returnFocusFromButton = (event: MouseEvent): void => {
    if (event.target instanceof Element && event.target.closest("button")) {
      this.#returnFocus();
    }
  };

  noteTap = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") {
      this.#isTapped = true;
    }
  };

  forgetTapElsewhere = (event: PointerEvent): void => {
    if (!this.#isInside(event.target)) {
      this.#isTapped = false;
    }
  };

  notePointerEntering = (event: PointerEvent): void => {
    this.#isPointerOver = event.pointerType === "mouse";
  };

  notePointerLeaving = (): void => {
    this.#isPointerOver = false;
  };

  undoFromKeyboard = (): void => {
    if (this.#notices.undoOffer === undefined) {
      return;
    }
    this.#returnFocus();
    this.#notices.undo();
  };

  #returnFocus(): void {
    if (!this.#isInside(document.activeElement)) {
      return;
    }
    if (this.#cameFrom?.isConnected === true) {
      this.#cameFrom.focus();
    } else {
      focusPageHeading();
    }
  }
}
