import { assertNever } from "#lib/assert-never.ts";
import type { BackSwipe } from "#lib/ipc/bindings.ts";

import { isGoingBack, placeScreens, type ScreenPlacement } from "./back-swipe";

/** Moves the current screen with a swipe from the edge, then either goes back or springs back once the swipe is let go. */
export class BackSwipeScreens {
  placement: ScreenPlacement | null = $state(null);
  isSettling = $state(false);
  #isLeaving = false;

  constructor(
    /** Returns whether there was still a way back to take. */
    private readonly goBack: () => boolean,
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

  /** Finishes the swipe once the screens have moved into place, which the caller watches for while settling. */
  settled(): void {
    if (!this.isSettling) {
      return;
    }
    if (this.#isLeaving && this.goBack()) {
      return;
    }
    this.arrived();
  }

  /** Puts the screens back as they were, for the page a finished swipe went back to. */
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
