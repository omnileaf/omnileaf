import { expect, onTestFinished, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import FastScroll from "./FastScroll.svelte";

const SCREEN_HEIGHT = 400;
const SCREENS_OF_CONTENT = 10;
const HANDLE_GAP_PX = 2;

function screenDrawnMoving(): HTMLDivElement {
  const screen = document.createElement("div");
  screen.style.cssText = `block-size: ${String(SCREEN_HEIGHT)}px; overflow-y: auto; transform: translateX(-96px) scale(0.5)`;
  const content = document.createElement("div");
  content.style.blockSize = `${String(SCREEN_HEIGHT * SCREENS_OF_CONTENT)}px`;
  screen.append(content);
  document.body.append(screen);
  onTestFinished(() => {
    screen.remove();
  });
  return screen;
}

function handleIn(screen: HTMLElement): Element | null {
  return screen.querySelector("[data-fast-scroll-handle]");
}

for (const ending of ["transitionend", "transitioncancel"]) {
  test(`puts its handle beside the screen once the screen's move ends with ${ending}`, async () => {
    const screen = screenDrawnMoving();
    await render(
      FastScroll,
      { total: 100, letterAt: () => "A" },
      { baseElement: screen },
    );
    await expect.poll(() => handleIn(screen)).not.toBeNull();

    screen.style.transform = "none";
    screen.dispatchEvent(
      new TransitionEvent(ending, { bubbles: true, propertyName: "transform" }),
    );

    await expect
      .poll(() => handleIn(screen)?.getBoundingClientRect().right)
      .toBe(screen.getBoundingClientRect().right - HANDLE_GAP_PX);
  });
}

test("puts its handle beside the screen once the screen is put back in place without a transition", async () => {
  const screen = screenDrawnMoving();
  await render(
    FastScroll,
    { total: 100, letterAt: () => "A" },
    { baseElement: screen },
  );
  await expect.poll(() => handleIn(screen)).not.toBeNull();

  screen.style.transform = "none";

  await expect
    .poll(() => handleIn(screen)?.getBoundingClientRect().right)
    .toBe(screen.getBoundingClientRect().right - HANDLE_GAP_PX);
});
