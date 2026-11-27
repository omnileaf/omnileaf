import type { Section } from "./sections";

export const FRAMES_TO_WAIT_FOR_A_CLICK = 3;
const MAIN_BUTTON = 0;

export const PRESS_HOLD_LIMIT_MS = 1000;

export interface Timers {
  readonly start: (ms: number, callback: () => void) => number;
  readonly stop: (handle: number) => void;
}

export interface Frames {
  readonly request: (callback: () => void) => number;
  readonly cancel: (handle: number) => void;
}

/** SvelteKit lets the browser paint between a link's click and its navigation, so a pressed tab keeps its pressed look until its own pill is drawn. */
export class TabPress {
  held: Section | undefined = $state();

  #pressed: Section | undefined;
  #isRouted = false;
  #waiting: number | undefined;
  #limit: number | undefined;

  constructor(
    private readonly frames: Frames,
    private readonly timers: Timers,
  ) {}

  pointerWentDown(tab: Section | undefined): void {
    this.#stopWaiting();
    this.#release();
    this.#pressed = tab;
    this.#isRouted = false;
  }

  longPressed(): void {
    this.#stopWaiting();
    this.#release();
    this.#pressed = undefined;
  }

  lifted(tab: Section, button: number, current: Section): void {
    if (button !== MAIN_BUTTON || tab !== this.#pressed || tab === current) {
      return;
    }
    this.#hold(tab);
    this.#waitForTheClick(FRAMES_TO_WAIT_FOR_A_CLICK);
  }

  clicked(tab: Section | undefined, isRouted: boolean, current: Section): void {
    const isThePressedTab = tab !== undefined && tab === this.#pressed;
    this.#stopWaiting();
    if (!isRouted || !isThePressedTab || tab === current) {
      this.#release();
      return;
    }
    this.#isRouted = true;
    this.#hold(tab);
  }

  settled(current: Section): void {
    if (this.held !== current) {
      this.#release();
      return;
    }
    this.#stopTheLimit();
  }

  arrived(section: Section): void {
    if (this.held === section) {
      this.#release();
    }
  }

  stop(): void {
    this.#stopWaiting();
    this.#stopTheLimit();
  }

  #hold(tab: Section): void {
    this.held = tab;
    this.#stopTheLimit();
    this.#limit = this.timers.start(PRESS_HOLD_LIMIT_MS, () => {
      this.#limit = undefined;
      this.held = undefined;
    });
  }

  #release(): void {
    this.held = undefined;
    this.#stopTheLimit();
  }

  #stopTheLimit(): void {
    if (this.#limit !== undefined) {
      this.timers.stop(this.#limit);
      this.#limit = undefined;
    }
  }

  #waitForTheClick(frames: number): void {
    this.#stopWaiting();
    this.#waiting = this.frames.request(() => {
      this.#waiting = undefined;
      if (this.#isRouted) {
        return;
      }
      if (frames > 1) {
        this.#waitForTheClick(frames - 1);
        return;
      }
      this.#release();
    });
  }

  #stopWaiting(): void {
    if (this.#waiting !== undefined) {
      this.frames.cancel(this.#waiting);
      this.#waiting = undefined;
    }
  }
}
