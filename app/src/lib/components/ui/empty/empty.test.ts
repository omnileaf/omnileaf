import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";
import EmptyHarness from "./EmptyHarness.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test("sets an empty state's art on a muted 10px square", async () => {
  document.documentElement.dataset.platform = "linux";
  document.documentElement.dataset.theme = "light";
  await render(EmptyHarness);

  const art = getComputedStyle(page.getByTestId("art").element());

  expect(art.borderTopLeftRadius).toBe("10px");
  expect(art.backgroundColor).toBe(
    resolvedColour("--muted", "backgroundColor"),
  );
});

test("sets an empty state's art in a tonal circle on Android", async () => {
  document.documentElement.dataset.platform = "android";
  document.documentElement.dataset.theme = "light";
  await render(EmptyHarness);

  const art = getComputedStyle(page.getByTestId("art").element());

  expect(art.borderTopLeftRadius).toBe("9999px");
  expect(art.backgroundColor).toBe(
    resolvedColour("--android-tonal", "backgroundColor"),
  );
});
