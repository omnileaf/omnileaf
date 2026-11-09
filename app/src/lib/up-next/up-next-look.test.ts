import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import UpNextHarness from "./UpNextHarness.svelte";

const PHONE = { width: 390, height: 844 };
const BACK_ARROW_SIZE = 24;

const NEVER_ANSWERS = new Promise<never>(() => undefined);

beforeEach(() => {
  Reflect.set(window, "__TAURI_INTERNALS__", {
    invoke: () => NEVER_ANSWERS,
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function onAndroidPhone() {
  document.body.replaceChildren();
  followCorePlatform("android");
  document.documentElement.dataset.theme = "dark";
  await page.viewport(PHONE.width, PHONE.height);
  return render(UpNextHarness);
}

test("draws the back arrow as Android's 24px arrow beside the top bar", async () => {
  const screen = await onAndroidPhone();

  const arrow = screen
    .getByRole("link", { name: "Back to Sample Series 04" })
    .element().firstElementChild;

  const box = arrow?.getBoundingClientRect();
  expect([box?.width, box?.height]).toEqual([BACK_ARROW_SIZE, BACK_ARROW_SIZE]);
});

test("sets the back to the series action in the muted ink", async () => {
  const screen = await onAndroidPhone();

  const back = screen.getByRole("link", { name: "Back to the series" });

  expect(getComputedStyle(back.element()).color).toBe(
    resolvedColour("--muted-foreground", "color"),
  );
});
