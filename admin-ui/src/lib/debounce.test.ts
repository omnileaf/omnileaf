import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { debounce } from "#lib/debounce.ts";

const DELAY_MS = 150;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("waits for the delay before acting", () => {
  const action = vi.fn();
  const debouncer = debounce(action, DELAY_MS);

  debouncer.schedule("a");
  vi.advanceTimersByTime(DELAY_MS - 1);
  expect(action).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);

  expect(action).toHaveBeenCalledExactlyOnceWith("a");
});

test("acts once with the last value after a burst", () => {
  const action = vi.fn();
  const debouncer = debounce(action, DELAY_MS);

  debouncer.schedule("a");
  vi.advanceTimersByTime(100);
  debouncer.schedule("ab");
  vi.advanceTimersByTime(100);
  debouncer.schedule("abc");
  vi.advanceTimersByTime(DELAY_MS);

  expect(action).toHaveBeenCalledExactlyOnceWith("abc");
});

test("acts again for a later value", () => {
  const action = vi.fn();
  const debouncer = debounce(action, DELAY_MS);

  debouncer.schedule("a");
  vi.advanceTimersByTime(DELAY_MS);
  debouncer.schedule("b");
  vi.advanceTimersByTime(DELAY_MS);

  expect(action.mock.calls).toEqual([["a"], ["b"]]);
});

test("does not act after it was cancelled", () => {
  const action = vi.fn();
  const debouncer = debounce(action, DELAY_MS);

  debouncer.schedule("a");
  debouncer.cancel();
  vi.advanceTimersByTime(DELAY_MS * 2);

  expect(action).not.toHaveBeenCalled();
});

test("can be cancelled when nothing is waiting", () => {
  const debouncer = debounce(vi.fn(), DELAY_MS);

  expect(() => {
    debouncer.cancel();
  }).not.toThrow();
});
