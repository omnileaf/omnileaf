import { afterEach, expect, test } from "vitest";

import {
  displayModesFrom,
  followDisplayModes,
  followWindowBackdropOnceThemed,
  type ThemeMatch,
} from "./display-modes";

const root = document.documentElement;

afterEach(() => {
  delete root.dataset.contrast;
  delete root.dataset.transparency;
  delete root.dataset.backdrop;
});

test("marks the root with the system's contrast and transparency settings", () => {
  followDisplayModes({ contrast: "high", transparency: "reduced" });

  expect(root.dataset.contrast).toBe("high");
  expect(root.dataset.transparency).toBe("reduced");
});

test("clears a setting the system turns off", () => {
  followDisplayModes({ contrast: "more", transparency: "reduced" });

  followDisplayModes({ contrast: undefined, transparency: undefined });

  expect(root.dataset.contrast).toBeUndefined();
  expect(root.dataset.transparency).toBeUndefined();
});

test("reads the settings from a page address and ignores values it does not know", () => {
  expect(
    displayModesFrom(new URLSearchParams("contrast=more&transparency=reduced")),
  ).toEqual({ contrast: "more", transparency: "reduced" });
  expect(
    displayModesFrom(new URLSearchParams("contrast=max&transparency=on")),
  ).toEqual({ contrast: undefined, transparency: undefined });
});

test("marks the root with the window's backdrop only once the window takes the app's theme", async () => {
  const themed = Promise.withResolvers<ThemeMatch>();

  const following = followWindowBackdropOnceThemed("mica", themed.promise);

  expect(root.dataset.backdrop).toBeUndefined();

  themed.resolve({ status: "ok" });
  await following;

  expect(root.dataset.backdrop).toBe("mica");
});

test("keeps the window solid when it cannot take the app's theme", async () => {
  await followWindowBackdropOnceThemed(
    "mica",
    Promise.resolve({ status: "error" }),
  );

  expect(root.dataset.backdrop).toBe("none");
});
