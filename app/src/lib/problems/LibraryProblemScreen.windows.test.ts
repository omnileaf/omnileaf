import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { LinkOpening } from "#lib/about/link-opening.svelte.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import LibraryProblemScreen from "./LibraryProblemScreen.svelte";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

async function screenOn(platform: "windows" | "macos") {
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  const screen = await render(LibraryProblemScreen, {
    problem: "writtenByANewerVersion",
    opening: new LinkOpening(() =>
      Promise.resolve({ status: "ok", data: null }),
    ),
  });
  return screen
    .getByRole("button", { name: "Get the latest Omnileaf" })
    .element();
}

test("offers the next step as a 32px accent button on Windows", async () => {
  const button = await screenOn("windows");

  const style = getComputedStyle(button);

  expect(style.height).toBe("32px");
  expect(style.borderTopLeftRadius).toBe("4px");
  expect(style.backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
});

test("keeps the round filled button on macOS", async () => {
  const button = await screenOn("macos");

  expect(
    parseFloat(getComputedStyle(button).borderTopLeftRadius),
  ).toBeGreaterThan(4);
});
