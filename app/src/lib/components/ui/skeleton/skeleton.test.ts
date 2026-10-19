import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";
import Skeleton from "./skeleton.svelte";

const PLATFORMS: readonly Platform[] = [
  "linux",
  "android",
  "ios",
  "macos",
  "windows",
];

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const platform of PLATFORMS) {
  for (const theme of ["light", "dark"] as const) {
    test(`fills a loading placeholder with the muted colour on ${platform} in the ${theme} theme`, async () => {
      document.documentElement.dataset.platform = platform;
      document.documentElement.dataset.theme = theme;
      const screen = await render(Skeleton, { "data-testid": "placeholder" });

      const placeholder = screen.getByTestId("placeholder").element();

      expect(getComputedStyle(placeholder).backgroundColor).toBe(
        resolvedColour("--muted", "backgroundColor"),
      );
    });
  }
}
