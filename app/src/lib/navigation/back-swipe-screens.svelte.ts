import { assertNever } from "#lib/assert-never.ts";
import type { BackSwipe } from "#lib/ipc/bindings.ts";

import { isGoingBack, placeScreens, type ScreenPlacement } from "./back-swipe";

export class BackSwipeScreens {
  placement: ScreenPlacement | null = $state(null);
  isSettling = $state(false);
  #isLeaving = false;

  constructor(
    private readonly tryGoBack: () => boolean,
    private readonly isMotionReduced: () => boolean,
  ) {}

  follow(swipe: BackSwipe): void {
    if (this.isSettling) {
      return;
    }
    switch (swipe.kind) {
      case "moved":
        this.placement = placeScreens(
          swipe.progress ?? 0,
          this.isMotionReduced(),
        );
        return;
      case "released":
        this.#settle(isGoingBack(swipe.progress ?? 0, swipe.velocity ?? 0));
        return;
      case "cancelled":
        this.#settle(false);
        return;
      default:
        assertNever(swipe);
    }
  }

  settled(): void {
    if (!this.isSettling) {
      return;
    }
    if (this.#isLeaving && this.tryGoBack()) {
      return;
    }
    this.arrived();
  }

  arrived(): void {
    this.isSettling = false;
    this.#isLeaving = false;
    this.placement = null;
  }

  #settle(isLeaving: boolean): void {
    if (this.placement === null) {
      return;
    }
    this.#isLeaving = isLeaving;
    this.isSettling = true;
    this.placement = placeScreens(isLeaving ? 1 : 0, this.isMotionReduced());
  }
}
