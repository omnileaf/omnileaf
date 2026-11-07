import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { followCorePlatform } from "#lib/page/platform.ts";

import LibraryGlyph from "./LibraryGlyph.svelte";

test("renders native Icon on Android", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryGlyph, { size: 24 });

  const icon = screen.container.querySelector('[data-icon="library"]');
  expect(icon).not.toBeNull();
});
