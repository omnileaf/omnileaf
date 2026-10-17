import { expect, test } from "vitest";

import { NEW_UNDO_RULES, UndoSetting } from "./undo-setting.svelte";

function memoryPreferenceStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("starts with Undo offered for ten seconds, held while hovered or focused", () => {
  expect(new UndoSetting(memoryPreferenceStore()).rules).toEqual({
    isOffered: true,
    windowSeconds: 10,
    holdsWhileHoveredOrFocused: true,
  });
});

test("remembers the rules chosen", () => {
  const store = memoryPreferenceStore();
  new UndoSetting(store).choose({ isOffered: false, windowSeconds: 30 });

  expect(new UndoSetting(store).rules).toEqual({
    ...NEW_UNDO_RULES,
    isOffered: false,
    windowSeconds: 30,
  });
});

test("falls back to the starting rules for anything stored it can't read", () => {
  const store = memoryPreferenceStore();
  store.setItem("omnileaf.undo", '{"windowSeconds":7,"isOffered":"yes"}');

  expect(new UndoSetting(store).rules).toEqual(NEW_UNDO_RULES);
});
