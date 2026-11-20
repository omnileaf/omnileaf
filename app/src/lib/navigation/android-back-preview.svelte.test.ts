import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  ANDROID_BACK_MOTION,
  AndroidBackPreview,
  leavingTarget,
} from "./android-back-preview.svelte";
import type { BackGestureAt } from "./back-preview";

const AREA = { left: 0, top: 0, width: 400, height: 800 };
const LOOK = { isDark: () => false, isMotionReduced: () => false };
const COPY = { content: {} as HTMLElement, scrollTop: 0 };

function screen(): HTMLElement {
  return { getBoundingClientRect: () => AREA } as unknown as HTMLElement;
}

function at(progress: number): BackGestureAt {
  return { progress, edge: "left", touchY: 0.5, cornerPx: 32 };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("moves a page that leaves to the right of where it stood, at full size", () => {
  const target = leavingTarget({ scale: 0.9, x: 12, y: 24 }, 400);

  expect(target).toEqual({ scale: 1, x: 128, y: 0 });
});

test("follows a gesture with the page's place and the screen's corners", () => {
  const preview = new AndroidBackPreview(LOOK);

  preview.follow(at(1), screen());

  expect(preview.phase).toBe("following");
  expect(preview.frame?.closing).toEqual({ scale: 0.9, x: 12, y: 0 });
  expect(preview.cornerPx).toBe(32);
});

test("springs back when the gesture is cancelled, then rests", () => {
  const preview = new AndroidBackPreview(LOOK);
  preview.follow(at(1), screen());

  preview.follow(undefined, screen());
  const whileCancelling = preview.phase;
  vi.advanceTimersByTime(ANDROID_BACK_MOTION.cancelMs);

  expect(whileCancelling).toBe("cancelling");
  expect(preview.phase).toBe("resting");
});

test("lets the page leave from where the gesture left it once back goes through", () => {
  const preview = new AndroidBackPreview(LOOK);
  preview.follow(at(1), screen());

  preview.leave(COPY);

  expect(preview.phase).toBe("committing");
  expect(preview.leaving).toMatchObject({
    from: { scale: 0.9, x: 12, y: 0 },
    to: { scale: 1, x: 128, y: 0 },
    scrim: 0.2,
  });
  expect(preview.enteringFrom).toEqual({ scale: 0.9, x: -96, y: 0 });
});

test("rests once the page has finished leaving", () => {
  const preview = new AndroidBackPreview(LOOK);
  preview.follow(at(1), screen());
  preview.leave(COPY);

  vi.advanceTimersByTime(ANDROID_BACK_MOTION.commitMs);

  expect(preview.phase).toBe("resting");
  expect(preview.leaving).toBeUndefined();
});

test("has no page to let leave when no gesture was moving", () => {
  const preview = new AndroidBackPreview(LOOK);

  preview.leave(COPY);

  expect(preview.phase).toBe("resting");
});

test("keeps square corners with reduced motion", () => {
  const preview = new AndroidBackPreview({
    ...LOOK,
    isMotionReduced: () => true,
  });

  preview.follow(at(1), screen());

  expect(preview.cornerPx).toBe(0);
});
