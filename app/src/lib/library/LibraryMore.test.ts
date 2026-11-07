import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { followCorePlatform } from "#lib/page/platform.ts";

import LibraryMore from "./LibraryMore.svelte";

let main: HTMLElement;

beforeEach(() => {
  main = document.createElement("main");
  document.body.appendChild(main);
});

afterEach(() => {
  main.remove();
});

test("renders native Icon on Android trigger", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryMore, {
    keepsLabels: true,
    onSelect: () => {},
  });

  const icon = screen.container.querySelector('[data-icon="ellipsis"]');
  expect(icon).not.toBeNull();
});
