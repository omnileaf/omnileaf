import { afterEach, expect, test } from "vitest";

import { guardLeaving, isLeavingGuarded } from "./leave-guard";

const stopGuarding: (() => void)[] = [];

function guard(isGuarding: () => boolean): void {
  stopGuarding.push(guardLeaving(isGuarding));
}

afterEach(() => {
  for (const stop of stopGuarding.splice(0)) {
    stop();
  }
});

test("is not guarded when nothing guards leaving", () => {
  expect(isLeavingGuarded()).toBe(false);
});

test("is guarded while a guard says it is, and not once it says it is not", () => {
  const state = { isDirty: true };
  guard(() => state.isDirty);
  const whileDirty = isLeavingGuarded();

  state.isDirty = false;

  expect([whileDirty, isLeavingGuarded()]).toEqual([true, false]);
});

test("is guarded while any one of several guards says so", () => {
  guard(() => false);
  guard(() => true);

  expect(isLeavingGuarded()).toBe(true);
});

test("is not guarded once the guard is taken away", () => {
  const stop = guardLeaving(() => true);

  stop();

  expect(isLeavingGuarded()).toBe(false);
});
