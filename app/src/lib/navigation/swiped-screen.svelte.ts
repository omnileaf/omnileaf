import { Channel } from "@tauri-apps/api/core";
import type { ClassValue } from "svelte/elements";
import { prefersReducedMotion } from "svelte/motion";

import { assertNever } from "#lib/assert-never.ts";
import type { BackSwipe, SwipeEdge } from "#lib/ipc/bindings.ts";

import { directionOf, SETTLING_MOTION } from "./back-swipe";
import { BackSwipeAllowance, watchBackSwipes } from "./back-swipe-allowance";
import { BackSwipeScreens } from "./back-swipe-screens.svelte";
import { unlessTakenByScreen, willScreenTakeBack } from "./back-within-screen";
import { getPreviousScreens, type ScreenCopy } from "./previous-screens";

export interface WayBack {
  readonly isOn: () => boolean;
  readonly backPathFrom: (screen: HTMLElement) => string | undefined;
  readonly goBack: () => boolean;
}

export interface ScreenBehind {
  readonly area: DOMRect;
  readonly copy: ScreenCopy | undefined;
  readonly offset: number;
  readonly dimming: number;
  readonly isSettling: boolean;
}

interface SwipeStart {
  readonly area: DOMRect;
  readonly backPath: string;
  readonly towardsBack: number;
}

const MOVING_LOOK = "bg-background shadow-back-swipe rtl:shadow-back-swipe-rtl";

function acrossScreen(swipe: BackSwipe, screen: DOMRect): BackSwipe {
  const scale = window.innerWidth / screen.width;
  switch (swipe.kind) {
    case "moved":
      return { ...swipe, progress: (swipe.progress ?? 0) * scale };
    case "released":
      return {
        ...swipe,
        progress: (swipe.progress ?? 0) * scale,
        velocity: (swipe.velocity ?? 0) * scale,
      };
    case "cancelled":
      return swipe;
    default:
      return assertNever(swipe);
  }
}

export class SwipedScreen {
  element: HTMLElement | undefined = $state();
  readonly #way: WayBack;
  readonly #previousScreens = getPreviousScreens();
  readonly #allowance = new BackSwipeAllowance();
  readonly #screens: BackSwipeScreens;
  #start: SwipeStart | undefined = $state();
  #allowedFor: string | undefined;

  constructor(way: WayBack) {
    this.#way = way;
    this.#screens = new BackSwipeScreens(
      () => this.#goBack(),
      () => prefersReducedMotion.current,
    );

    $effect(() => {
      if (!way.isOn()) {
        return;
      }
      watchBackSwipes(
        new Channel((swipe) => {
          this.#follow(swipe);
        }),
      );
      return () => {
        this.#allowedFor = undefined;
        this.#allowance.withdraw();
        this.#screens.arrived();
      };
    });

    $effect(() => {
      if (this.#screens.isSettling && this.element !== undefined) {
        void this.#screens.settleOnceMoved(this.element);
      }
    });
  }

  get behind(): ScreenBehind | undefined {
    const { placement, isSettling } = this.#screens;
    if (placement === null || this.#start === undefined) {
      return undefined;
    }
    return {
      area: this.#start.area,
      copy: this.#previousScreens.of(this.#start.backPath),
      offset: placement.previous * this.#start.towardsBack,
      dimming: placement.dimming,
      isSettling,
    };
  }

  get transform(): string | undefined {
    const { placement } = this.#screens;
    if (placement === null || this.#start === undefined) {
      return undefined;
    }
    return `translateX(${String(placement.current * this.#start.towardsBack)}%)`;
  }

  get look(): ClassValue {
    return [
      this.transform !== undefined && MOVING_LOOK,
      this.#screens.isSettling && ["transition-transform", SETTLING_MOTION],
    ];
  }

  allowFor(
    shown: string,
    edgeOf: (screen: HTMLElement) => SwipeEdge | null,
  ): void {
    if (
      !this.#way.isOn() ||
      this.element === undefined ||
      this.#allowedFor === shown
    ) {
      return;
    }
    this.#allowedFor = shown;
    this.#allowance.allow(edgeOf(this.element));
  }

  arrived(): void {
    this.#screens.arrived();
  }

  putBack(): void {
    this.#previousScreens.cancelLanding();
    this.#screens.arrived();
  }

  #startFrom(screen: HTMLElement): SwipeStart | undefined {
    const backPath = this.#way.backPathFrom(screen);
    if (backPath === undefined) {
      return undefined;
    }
    return {
      area: screen.getBoundingClientRect(),
      backPath,
      towardsBack: directionOf(screen) === "rtl" ? -100 : 100,
    };
  }

  #follow(swipe: BackSwipe): void {
    if (!this.#way.isOn()) {
      return;
    }
    if (this.#screens.placement === null) {
      if (willScreenTakeBack()) {
        unlessTakenByScreen(swipe);
        return;
      }
      this.#start =
        this.element === undefined ? undefined : this.#startFrom(this.element);
    }
    if (this.#start !== undefined) {
      this.#screens.follow(
        unlessTakenByScreen(acrossScreen(swipe, this.#start.area)),
      );
    }
  }

  #goBack(): boolean {
    if (this.#start === undefined) {
      return false;
    }
    this.#previousScreens.landOn(this.#start.backPath);
    if (this.#way.goBack()) {
      return true;
    }
    this.#previousScreens.cancelLanding();
    return false;
  }
}
