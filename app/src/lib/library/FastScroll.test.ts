import { tick } from "svelte";
import { expect, onTestFinished, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import FastScroll from "./FastScroll.svelte";

const SCREEN_HEIGHT = 400;
const SCREENS_OF_CONTENT = 10;
const HANDLE_GAP_PX = 2;
const MOVES_IN_ONE_FRAME = [4, 8, 12, 16];
const AWAY_AND_BACK = ["translateY(24px)", "none"];

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

function restylesOf(element: Element): () => number {
  let restyles = 0;
  const watch = new MutationObserver((changes) => {
    restyles += changes.length;
  });
  watch.observe(element, { attributeFilter: ["style"] });
  onTestFinished(() => {
    watch.disconnect();
  });
  return () => restyles;
}

function nextFrame(): Promise<void> {
  return new Promise((drawn) => {
    requestAnimationFrame(() => {
      drawn();
    });
  });
}

async function shownHandleIn(screen: HTMLElement): Promise<Element> {
  await expect.poll(() => handleIn(screen)).not.toBeNull();
  const handle = handleIn(screen);
  if (handle === null) {
    throw new Error("no fast-scroll handle");
  }
  await nextFrame();
  return handle;
}

async function moveWithinOneFrame(
  screen: HTMLElement,
  transforms: readonly string[],
): Promise<void> {
  for (const transform of transforms) {
    screen.style.transform = transform;
    await tick();
  }
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

test("restyles its handle once for many moves of its screen within one frame", async () => {
  const screen = screenDrawnMoving();
  screen.style.transform = "none";
  await render(
    FastScroll,
    { total: 100, letterAt: () => "A" },
    { baseElement: screen },
  );
  const restyles = restylesOf(await shownHandleIn(screen));

  await moveWithinOneFrame(
    screen,
    MOVES_IN_ONE_FRAME.map((down) => `translateY(${String(down)}px)`),
  );
  await nextFrame();
  await tick();

  expect(restyles()).toBe(1);
});

test("leaves its handle's style alone when its screen moves away and back within one frame", async () => {
  const screen = screenDrawnMoving();
  screen.style.transform = "none";
  await render(
    FastScroll,
    { total: 100, letterAt: () => "A" },
    { baseElement: screen },
  );
  const restyles = restylesOf(await shownHandleIn(screen));

  await moveWithinOneFrame(screen, AWAY_AND_BACK);
  await nextFrame();
  await tick();

  expect(restyles()).toBe(0);
});
