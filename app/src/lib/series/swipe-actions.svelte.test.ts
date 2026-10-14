import { expect, test } from "vitest";

import { SwipeActionsSetting } from "./swipe-actions.svelte";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("marks a book read with a swipe toward the end, and does nothing the other way, until chosen otherwise", () => {
  const setting = new SwipeActionsSetting(memoryStore());

  expect([
    setting.actionFor("towardEnd"),
    setting.actionFor("towardStart"),
  ]).toEqual(["markRead", "nothing"]);
});

test("remembers what each way of swiping does", () => {
  const store = memoryStore();

  const chosen = new SwipeActionsSetting(store);
  chosen.choose("towardEnd", "nothing");
  chosen.choose("towardStart", "markRead");
  const remembered = new SwipeActionsSetting(store);

  expect([
    remembered.actionFor("towardEnd"),
    remembered.actionFor("towardStart"),
  ]).toEqual(["nothing", "markRead"]);
});

test("keeps the usual action when what was stored isn't one", () => {
  const store = memoryStore();
  store.setItem("omnileaf.swipeTowardEnd", "delete");

  expect(new SwipeActionsSetting(store).actionFor("towardEnd")).toBe(
    "markRead",
  );
});
