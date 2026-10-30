import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { DEFAULT_SCREENSHOT_SHORTCUT } from "./key-combination";
import ShortcutKeys from "./ShortcutKeys.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test.each([
  { theme: "light", ink: "rgba(0, 0, 0, 0.894)" },
  { theme: "dark", ink: "rgb(255, 255, 255)" },
])(
  "sets the Windows shortcut as one Body-size text in the $theme theme's ink, as the key-capture field does",
  async ({ theme, ink }) => {
    document.documentElement.dataset.platform = "windows";
    document.documentElement.dataset.theme = theme;

    const screen = await render(ShortcutKeys, {
      combination: DEFAULT_SCREENSHOT_SHORTCUT,
      platform: "windows",
    });

    const keys = [...screen.container.querySelectorAll("kbd")];
    const [only] = keys;
    const style = only && getComputedStyle(only);

    expect(keys.map((key) => key.textContent.trim())).toEqual(["Ctrl+Shift+H"]);
    expect(style?.fontSize).toBe("14px");
    expect(style?.lineHeight).toBe("20px");
    expect(style?.fontWeight).toBe("400");
    expect(style?.color).toBe(ink);
    expect(style?.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style?.padding).toBe("0px");
  },
);

test("keeps each key on its own chip on Linux", async () => {
  document.documentElement.dataset.platform = "linux";

  const screen = await render(ShortcutKeys, {
    combination: DEFAULT_SCREENSHOT_SHORTCUT,
    platform: "linux",
  });

  expect(
    [...screen.container.querySelectorAll("kbd")].map((key) =>
      key.textContent.trim(),
    ),
  ).toEqual(["Ctrl", "Shift", "H"]);
});
