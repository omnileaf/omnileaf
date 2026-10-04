import { expect, test } from "vitest";

import { CrashReportSetting } from "./choice.svelte";

const CHOICE_KEY = "omnileaf.crash-reports";

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const refusingStore = {
  getItem: (): string | null => {
    throw new Error("storage is off");
  },
  setItem: () => {
    throw new Error("storage is off");
  },
};

test("asks each time until the person chooses otherwise", () => {
  const setting = new CrashReportSetting(memoryStore());

  expect(setting.choice).toBe("ask");
});

test("starts from the choice kept from an earlier run", () => {
  const setting = new CrashReportSetting(
    memoryStore({ [CHOICE_KEY]: "never" }),
  );

  expect(setting.choice).toBe("never");
});

test("asks each time when the kept choice isn't one it knows", () => {
  const setting = new CrashReportSetting(
    memoryStore({ [CHOICE_KEY]: "sometimes" }),
  );

  expect(setting.choice).toBe("ask");
});

test("keeps a new choice for the next run", () => {
  const store = memoryStore();
  const setting = new CrashReportSetting(store);

  setting.choose("always");

  expect(setting.choice).toBe("always");
  expect(store.values.get(CHOICE_KEY)).toBe("always");
});

test("still changes the choice when storage refuses it", () => {
  const setting = new CrashReportSetting(refusingStore);

  setting.choose("never");

  expect(setting.choice).toBe("never");
});
