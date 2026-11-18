import { expect, test } from "vitest";

import { OpensOnSetting } from "./opens-on.svelte";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("opens on the library until another place is chosen", () => {
  expect(new OpensOnSetting(memoryStore()).choice).toBe("library");
});

test("remembers where Omnileaf opens", () => {
  const store = memoryStore();

  new OpensOnSetting(store).choose("lastBook");

  expect(new OpensOnSetting(store).choice).toBe("lastBook");
});

test("opens on the library when what was stored isn't a place", () => {
  const store = memoryStore();
  store.setItem("omnileaf.opensOn", "browse");

  expect(new OpensOnSetting(store).choice).toBe("library");
});
