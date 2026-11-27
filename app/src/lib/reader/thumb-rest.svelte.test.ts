import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { THUMB_REST_MS, ThumbRest } from "./thumb-rest.svelte";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("rests on a page the thumb is held on for a moment", () => {
  const rest = new ThumbRest();

  rest.hold(5);
  vi.advanceTimersByTime(THUMB_REST_MS);

  expect(rest.restingOn).toBe(5);
});

test("rests on no page the thumb only passes", () => {
  const rest = new ThumbRest();

  rest.hold(5);
  vi.advanceTimersByTime(THUMB_REST_MS - 1);
  const passing = rest.restingOn;
  rest.hold(6);
  vi.advanceTimersByTime(THUMB_REST_MS - 1);

  expect([passing, rest.restingOn]).toEqual([undefined, undefined]);
});

test("leaves the page it rested on as soon as the thumb moves on", () => {
  const rest = new ThumbRest();
  rest.hold(5);
  vi.advanceTimersByTime(THUMB_REST_MS);

  rest.hold(6);

  expect(rest.restingOn).toBeUndefined();
});

test("lets go when held on no page", () => {
  const rest = new ThumbRest();
  rest.heldOn(5);
  vi.advanceTimersByTime(THUMB_REST_MS);

  rest.heldOn(undefined);

  expect(rest.restingOn).toBeUndefined();
});

test("rests on nothing once let go", () => {
  const rest = new ThumbRest();
  rest.hold(5);
  vi.advanceTimersByTime(THUMB_REST_MS);

  rest.letGo();
  rest.hold(7);
  rest.letGo();
  vi.advanceTimersByTime(THUMB_REST_MS);

  expect(rest.restingOn).toBeUndefined();
});
