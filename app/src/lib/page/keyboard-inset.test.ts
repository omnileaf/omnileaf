import { afterEach, expect, test } from "vitest";

import { followKeyboard } from "./keyboard-inset";

class FakeViewport extends EventTarget {
  height: number;
  offsetTop = 0;

  constructor(height: number) {
    super();
    this.height = height;
  }

  moveTo(height: number, offsetTop: number): void {
    this.height = height;
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event("resize"));
  }
}

const root = document.documentElement;

function inset(): string {
  return root.style.getPropertyValue("--keyboard-inset");
}

afterEach(() => {
  root.style.removeProperty("--keyboard-inset");
});

test("names what the keyboard covers below the visual viewport, and forgets it once stopped", () => {
  const layoutHeight = root.clientHeight;
  const viewport = new FakeViewport(layoutHeight);
  const stop = followKeyboard(viewport, root);
  const seen = [inset()];

  viewport.moveTo(layoutHeight - 336, 0);
  seen.push(inset());
  viewport.moveTo(layoutHeight - 336, 336);
  seen.push(inset());
  stop();
  seen.push(inset());

  expect(seen).toEqual(["0px", "336px", "0px", ""]);
});
