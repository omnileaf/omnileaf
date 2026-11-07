import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import CollectionHeadingHarness from "./CollectionHeadingHarness.svelte";

const actionsSnippet = createRawSnippet(() => ({
  render: () => '<button type="button">Action</button>',
}));

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

test("does not render folding title bar when largeTitle is false", async () => {
  followCorePlatform("android");
  const screen = await render(CollectionHeadingHarness, {
    title: "History",
    showsLabel: false,
    actions: actionsSnippet,
    platform: "android",
    largeTitle: false,
  });

  const foldingBar = screen.container.querySelector("[data-title-bar]");
  expect(foldingBar).toBeNull();
});

test("renders folding title bar when largeTitle is true and actions are present", async () => {
  const screen = await render(CollectionHeadingHarness, {
    title: "Library",
    showsLabel: false,
    actions: actionsSnippet,
    platform: "ios",
    largeTitle: true,
  });

  const foldingBar = screen.container.querySelector("[data-title-bar]");
  expect(foldingBar).not.toBeNull();
});

test("falls back to default platform behavior when largeTitle is undefined", async () => {
  followCorePlatform("macos");
  const screen = await render(CollectionHeadingHarness, {
    title: "History",
    showsLabel: false,
    actions: actionsSnippet,
    platform: "macos",
  });

  const foldingBar = screen.container.querySelector("[data-title-bar]");
  expect(foldingBar).toBeNull();
});
