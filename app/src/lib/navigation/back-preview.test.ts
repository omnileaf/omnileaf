import type { Channel } from "@tauri-apps/api/core";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { expect, test } from "vitest";

import type { BackSwipe } from "#lib/ipc/bindings.ts";

import {
  type BackGestureAt,
  type BackGestureStep,
  backPreviewFrame,
  previewBackGestures,
} from "./back-preview";

const SCREEN = { width: 400, height: 800, isDark: false };
const START: BackGestureAt = {
  progress: 0,
  edge: "left",
  touchY: 0.5,
  cornerPx: 32,
};

function at(progress: number, change: Partial<BackGestureAt> = {}) {
  return { ...START, progress, ...change };
}

test("leaves the page where it is before the gesture moves, the page behind waiting 96 px to its left", () => {
  expect(backPreviewFrame(START, START, SCREEN, false)).toEqual({
    closing: { scale: 1, x: 0, y: 0 },
    entering: { scale: 1, x: -96, y: 0 },
    scrim: 0.2,
  });
});

test("shrinks a page swiped from the left edge to 90% and moves it to 8 px from the right edge", () => {
  const frame = backPreviewFrame(START, at(1), SCREEN, false);

  expect(frame.closing).toEqual({ scale: 0.9, x: 12, y: 0 });
  expect(frame.entering).toEqual({ scale: 0.9, x: -96, y: 0 });
});

test("shrinks a page swiped from the right edge to 90% in the middle", () => {
  const frame = backPreviewFrame(
    { ...START, edge: "right" },
    at(1, { edge: "right" }),
    SCREEN,
    false,
  );

  expect(frame.closing).toEqual({ scale: 0.9, x: 0, y: 0 });
});

test("follows the finger down, slowing as it nears 8 px from the screen's edge", () => {
  const frame = backPreviewFrame(START, at(1, { touchY: 0.75 }), SCREEN, false);

  expect(frame.closing.y).toBeCloseTo(24);
  expect(frame.entering.y).toBeCloseTo(24);
});

test("follows the finger up as far as down", () => {
  const frame = backPreviewFrame(START, at(1, { touchY: 0.25 }), SCREEN, false);

  expect(frame.closing.y).toBeCloseTo(-24);
});

test("moves no further than 8 px from the screen's edge however far the finger goes", () => {
  const frame = backPreviewFrame(START, at(1, { touchY: 1 }), SCREEN, false);

  expect(frame.closing.y).toBeCloseTo(32);
});

test("shrinks faster early in the gesture, as Android's back curve does", () => {
  const { scale } = backPreviewFrame(START, at(0.5), SCREEN, false).closing;

  expect(scale).toBeLessThan(0.95);
  expect(scale).toBeGreaterThan(0.9);
});

test("keeps to the gesture's range however far the system reports it", () => {
  expect(backPreviewFrame(START, at(1.4), SCREEN, false)).toEqual(
    backPreviewFrame(START, at(1), SCREEN, false),
  );
  expect(backPreviewFrame(START, at(-0.2), SCREEN, false)).toEqual(
    backPreviewFrame(START, at(0), SCREEN, false),
  );
});

test("dims the page behind more in the dark theme", () => {
  expect(
    backPreviewFrame(START, at(1), { ...SCREEN, isDark: true }, false).scrim,
  ).toBe(0.8);
});

test("neither scales nor moves either page with reduced motion", () => {
  expect(backPreviewFrame(START, at(1, { touchY: 0.9 }), SCREEN, true)).toEqual(
    {
      closing: { scale: 1, x: 0, y: 0 },
      entering: { scale: 1, x: 0, y: 0 },
      scrim: 0,
    },
  );
});

test("reports where a gesture starts and moves, and its end once it is cancelled", async () => {
  const shown: BackGestureStep[] = [];
  mockIPC((command, args) => {
    if (command === "watch_back_swipes") {
      const channel = (args as { onSwipe: Channel<BackSwipe> }).onSwipe;
      channel.onmessage({
        kind: "started",
        progress: 0,
        edge: "right",
        touchY: 0.3,
        corner: 32,
      });
      channel.onmessage({
        kind: "moved",
        progress: 0.4,
        edge: "right",
        touchY: 0.3,
        corner: 32,
      });
      channel.onmessage({ kind: "cancelled" });
    }
    return null;
  });

  previewBackGestures(
    (step) => {
      shown.push(step);
    },
    () => true,
  );

  await expect
    .poll(() => shown)
    .toEqual([
      {
        kind: "started",
        at: { progress: 0, edge: "right", touchY: 0.3, cornerPx: 32 },
      },
      {
        kind: "moved",
        at: { progress: 0.4, edge: "right", touchY: 0.3, cornerPx: 32 },
      },
      { kind: "ended" },
    ]);
  clearMocks();
});

test("takes a gesture that says nothing of its edge, finger or corner as one from the left, halfway down, on a square screen", async () => {
  const shown: BackGestureStep[] = [];
  mockIPC((command, args) => {
    if (command === "watch_back_swipes") {
      const channel = (args as { onSwipe: Channel<BackSwipe> }).onSwipe;
      channel.onmessage({
        kind: "moved",
        progress: 0.4,
        edge: null,
        touchY: null,
        corner: null,
      });
    }
    return null;
  });

  previewBackGestures(
    (step) => {
      shown.push(step);
    },
    () => true,
  );

  await expect
    .poll(() => shown)
    .toEqual([
      {
        kind: "moved",
        at: { progress: 0.4, edge: null, touchY: 0.5, cornerPx: 0 },
      },
    ]);
  clearMocks();
});

function previewOnce(isScreenKept: boolean) {
  const shown: BackGestureStep[] = [];
  mockIPC(() => null);
  const stop = previewBackGestures(
    (step) => {
      shown.push(step);
    },
    () => isScreenKept,
  );
  return { shown, stop };
}

test("ends the preview when the page steps back and keeps its screen", () => {
  const { shown, stop } = previewOnce(true);

  dispatchEvent(new PopStateEvent("popstate"));

  expect(shown).toEqual([{ kind: "ended" }]);
  stop();
  clearMocks();
});

test("leaves the preview to the next screen when the page's step back changes the screen", () => {
  const { shown, stop } = previewOnce(false);

  dispatchEvent(new PopStateEvent("popstate"));

  expect(shown).toEqual([]);
  stop();
  clearMocks();
});

test("stops ending the preview once it stops watching", () => {
  const { shown, stop } = previewOnce(true);

  stop();
  dispatchEvent(new PopStateEvent("popstate"));

  expect(shown).toEqual([]);
  clearMocks();
});
