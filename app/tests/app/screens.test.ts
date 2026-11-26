import { expect, test } from "vitest";

import { isOnScreens, screensFromEnvironment } from "../screens.ts";

test("runs every screen when no screens are set", () => {
  expect(screensFromEnvironment(undefined)).toBeNull();
});

test("runs every screen when the variable is empty", () => {
  expect(screensFromEnvironment("")).toBeNull();
});

test("picks the screens named, once each, in the order the suite lists them", () => {
  expect(screensFromEnvironment("desktop,phone,desktop")).toEqual([
    "phone",
    "desktop",
  ]);
});

test.each(["phone,watch", "Phone", "phone;desktop", "phone,", " phone"])(
  "rejects %j, which names a screen that does not exist",
  (value) => {
    expect(() => screensFromEnvironment(value)).toThrow(JSON.stringify(value));
  },
);

test("keeps a screen project whose screen is picked", () => {
  expect(isOnScreens("webkit-desktop", ["phone", "desktop"])).toBe(true);
});

test("leaves out a screen project whose screen is not picked", () => {
  expect(isOnScreens("chromium-tablet", ["phone", "desktop"])).toBe(false);
});

test("keeps every project when every screen is picked", () => {
  expect(isOnScreens("chromium-tablet", null)).toBe(true);
});

test.each(["ios-phone", "android-phone", "speed"])(
  "keeps the %s project whatever screens are picked",
  (project) => {
    expect(isOnScreens(project, ["desktop"])).toBe(true);
  },
);
