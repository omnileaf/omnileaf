import { afterEach, expect, test, vi } from "vitest";

import { AnimationsSetting } from "./animations.svelte";

function asksToReduceMotion(reduces: boolean): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) => ({ matches: reduces, media: query }) as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("plays every group of movement until one is turned off", () => {
  const setting = new AnimationsSetting(memoryStore());

  expect([
    setting.isOn("navigation"),
    setting.isOn("sheets"),
    setting.isOn("reader"),
    setting.isOn("loading"),
    setting.stillGroups,
  ]).toEqual([true, true, true, true, ""]);
});

test("names the groups held still, and remembers them", () => {
  const store = memoryStore();
  const setting = new AnimationsSetting(store);

  setting.turn("loading", false);
  setting.turn("sheets", false);
  setting.turn("sheets", true);

  expect([
    setting.stillGroups,
    new AnimationsSetting(store).stillGroups,
  ]).toEqual(["loading", "loading"]);
});

test("ignores a stored group it doesn't know", () => {
  const store = memoryStore();
  store.setItem("omnileaf.animationsStill", "reader sparkles");

  expect(new AnimationsSetting(store).stillGroups).toBe("reader");
});

test("follows a change another window made to the stored groups", () => {
  const store = memoryStore();
  const here = new AnimationsSetting(store);
  new AnimationsSetting(store).turn("navigation", false);

  here.reread();

  expect(here.isOn("navigation")).toBe(false);
});

test("moves a group in script only while it is on and the system does not ask for less motion", () => {
  const setting = new AnimationsSetting(memoryStore());
  asksToReduceMotion(false);
  const moving = setting.moves("navigation");
  setting.turn("navigation", false);
  const heldStill = setting.moves("navigation");
  setting.turn("navigation", true);
  asksToReduceMotion(true);

  expect([moving, heldStill, setting.moves("navigation")]).toEqual([
    true,
    false,
    false,
  ]);
});
