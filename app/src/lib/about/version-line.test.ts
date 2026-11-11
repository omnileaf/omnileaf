import { expect, test } from "vitest";

import { builtOn, deviceNameOf, versionDetails } from "./version-line";

const BUILT = new Date("2026-10-15T09:30:00Z");
const PIXEL_WEB_VIEW =
  "Mozilla/5.0 (Linux; Android 16; Pixel 8 Build/BP2A.250605.031; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.0.0 Mobile Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

test("reads the build date the build stamped", () => {
  expect(builtOn("2026-10-15T09:30:00.000Z")).toEqual(BUILT);
});

test("leaves an unstamped or garbled build date out", () => {
  expect([builtOn(undefined), builtOn(""), builtOn("soon")]).toEqual([
    undefined,
    undefined,
    undefined,
  ]);
});

test("names the Android device its web view reports", () => {
  expect(deviceNameOf(PIXEL_WEB_VIEW)).toBe("Pixel 8");
});

test("names no device away from Android", () => {
  expect(deviceNameOf(DESKTOP)).toBeUndefined();
});

test("joins the version, the build date and the device", () => {
  expect(versionDetails("0.1.0", BUILT, "Pixel 8", "en-GB")).toBe(
    "0.1.0 · 15 Oct 2026 · Pixel 8",
  );
});

test("leaves out what isn't known", () => {
  expect(versionDetails("0.1.0", undefined, undefined, "en-GB")).toBe("0.1.0");
});
