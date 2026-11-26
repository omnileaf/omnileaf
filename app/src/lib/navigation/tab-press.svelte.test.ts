import { expect, test } from "vitest";

import {
  FRAMES_TO_WAIT_FOR_A_CLICK,
  type Frames,
  TabPress,
} from "./tab-press.svelte.ts";

const MAIN_BUTTON = 0;
const SECONDARY_BUTTON = 2;

class FakeFrames implements Frames {
  #next = 1;
  readonly #waiting = new Map<number, () => void>();

  request = (callback: () => void): number => {
    const handle = this.#next;
    this.#next += 1;
    this.#waiting.set(handle, callback);
    return handle;
  };

  cancel = (handle: number): void => {
    this.#waiting.delete(handle);
  };

  get pending(): number {
    return this.#waiting.size;
  }

  paint(count = 1): void {
    for (let frame = 0; frame < count; frame += 1) {
      const due = [...this.#waiting.values()];
      this.#waiting.clear();
      for (const callback of due) {
        callback();
      }
    }
  }
}

function tapStarted(): { press: TabPress; frames: FakeFrames } {
  const frames = new FakeFrames();
  const press = new TabPress(frames);
  press.pointerWentDown("history");
  press.lifted("history", MAIN_BUTTON, "library");
  return { press, frames };
}

test.each([1, 2])(
  "keeps holding a lifted tab when its click comes %i frames later",
  (late) => {
    const { press, frames } = tapStarted();

    frames.paint(late);
    const heldBeforeTheClick = press.held;
    press.clicked("history", true, "library");
    frames.paint(FRAMES_TO_WAIT_FOR_A_CLICK);

    expect(heldBeforeTheClick).toBe("history");
    expect(press.held).toBe("history");
  },
);

test("lets go of a lifted tab no click follows", () => {
  const { press, frames } = tapStarted();

  frames.paint(FRAMES_TO_WAIT_FOR_A_CLICK);

  expect(press.held).toBeUndefined();
});

test("holds a tab again when its routed click comes after the wait", () => {
  const { press, frames } = tapStarted();

  frames.paint(FRAMES_TO_WAIT_FOR_A_CLICK);
  press.clicked("history", true, "library");

  expect(press.held).toBe("history");
});

test("holds nothing after the browser calls the press a long press", () => {
  const press = new TabPress(new FakeFrames());

  press.pointerWentDown("history");
  press.longPressed();
  press.lifted("history", MAIN_BUTTON, "library");

  expect(press.held).toBeUndefined();
});

test("holds nothing for a button other than the main one", () => {
  const press = new TabPress(new FakeFrames());

  press.pointerWentDown("history");
  press.lifted("history", SECONDARY_BUTTON, "library");

  expect(press.held).toBeUndefined();
});

test("holds nothing for a tab that is already open", () => {
  const press = new TabPress(new FakeFrames());

  press.pointerWentDown("library");
  press.lifted("library", MAIN_BUTTON, "library");
  press.clicked("library", true, "library");

  expect(press.held).toBeUndefined();
});

test("holds no tab for a routed click somewhere else after a swallowed lift", () => {
  const press = new TabPress(new FakeFrames());
  press.pointerWentDown("history");

  press.pointerWentDown(undefined);
  press.clicked(undefined, true, "library");

  expect(press.held).toBeUndefined();
});

test("lets go when the click is not routed", () => {
  const { press } = tapStarted();

  press.clicked("history", false, "library");

  expect(press.held).toBeUndefined();
});

test("lets go when a navigation settles away from the held tab", () => {
  const { press } = tapStarted();
  press.clicked("history", true, "library");

  press.settled("library");

  expect(press.held).toBeUndefined();
});

test("keeps holding when the navigation lands on the held tab until it arrives", () => {
  const { press } = tapStarted();
  press.clicked("history", true, "library");

  press.settled("history");
  const heldOnLanding = press.held;
  press.arrived("history");

  expect(heldOnLanding).toBe("history");
  expect(press.held).toBeUndefined();
});

test("cancels its waiting frame when stopped", () => {
  const { press, frames } = tapStarted();

  press.stop();

  expect(frames.pending).toBe(0);
});
