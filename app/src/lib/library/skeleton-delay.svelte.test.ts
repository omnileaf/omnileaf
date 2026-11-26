import { afterEach, expect, test, vi } from "vitest";

import { SKELETON_DELAY_MS, SkeletonDelay } from "./skeleton-delay.svelte";

afterEach(() => {
  vi.useRealTimers();
});

test("holds the skeleton back until the delay has passed", () => {
  vi.useFakeTimers();
  const delay = new SkeletonDelay();
  delay.wait();

  vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
  const isDueBefore = delay.isDue;
  vi.advanceTimersByTime(1);

  expect([isDueBefore, delay.isDue]).toEqual([false, true]);
});

test("never lets the skeleton show once it stops waiting", () => {
  vi.useFakeTimers();
  const delay = new SkeletonDelay();
  const stop = delay.wait();

  stop();
  vi.advanceTimersByTime(SKELETON_DELAY_MS);

  expect(delay.isDue).toBe(false);
});
