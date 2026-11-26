import type { Section } from "./sections";

export const FRAMES_TO_WAIT_FOR_A_CLICK = 3;
const MAIN_BUTTON = 0;

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

  constructor(private readonly frames: Frames) {}

  pointerWentDown(tab: Section | undefined): void {
    this.#stopWaiting();
    this.held = undefined;
    this.#pressed = tab;
    this.#isRouted = false;
  }

  longPressed(): void {
    this.#stopWaiting();
    this.held = undefined;
    this.#pressed = undefined;
  }

  lifted(tab: Section, button: number, current: Section): void {
    if (button !== MAIN_BUTTON || tab !== this.#pressed || tab === current) {
      return;
    }
    this.held = tab;
    this.#waitForTheClick(FRAMES_TO_WAIT_FOR_A_CLICK);
  }

  clicked(tab: Section | undefined, isRouted: boolean, current: Section): void {
    const isThePressedTab = tab !== undefined && tab === this.#pressed;
    if (!isRouted || !isThePressedTab) {
      this.#stopWaiting();
      this.held = undefined;
      return;
    }
    this.#isRouted = true;
    this.#stopWaiting();
    this.held = tab === current ? undefined : tab;
  }

  settled(current: Section): void {
    if (this.held !== current) {
      this.held = undefined;
    }
  }

  arrived(section: Section): void {
    if (this.held === section) {
      this.held = undefined;
    }
  }

  stop(): void {
    this.#stopWaiting();
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
      this.held = undefined;
    });
  }

  #stopWaiting(): void {
    if (this.#waiting !== undefined) {
      this.frames.cancel(this.#waiting);
      this.#waiting = undefined;
    }
  }
}
