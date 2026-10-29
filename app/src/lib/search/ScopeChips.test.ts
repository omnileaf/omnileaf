import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { followCorePlatform } from "#lib/page/platform.ts";

import ScopeChips from "./ScopeChips.svelte";

const PHONE = { width: 390, height: 800 } as const;
const NARROW_PHONE = { width: 260, height: 800 } as const;
const TABLET = { width: 1024, height: 800 } as const;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function scopeChipsOn(
  platform: "ios" | "android",
  size: { width: number; height: number },
) {
  await page.viewport(size.width, size.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(ScopeChips, { scope: "manga", onNarrow: () => undefined });
}

function chip(name: string): HTMLElement {
  const element = page
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .element();
  if (!(element instanceof HTMLElement)) {
    throw new Error(`no chip called ${name}`);
  }
  return element;
}

test("draws the scopes as 28 point capsules on the control fill on an iPhone", async () => {
  await scopeChipsOn("ios", PHONE);

  const idle = chip("Everything");
  const style = getComputedStyle(idle);

  expect({
    isCapsule:
      Number.parseFloat(style.borderTopLeftRadius) >=
      idle.getBoundingClientRect().height / 2,
    hasNoBorder: style.borderTopWidth === "0px",
    height: idle.getBoundingClientRect().height,
    fill: style.backgroundColor,
  }).toEqual({
    isCapsule: true,
    hasNoBorder: true,
    height: 28,
    fill: resolvedColour("--color-native-button-outline", "backgroundColor"),
  });
});

test("raises the narrowed scope onto the accent-soft fill in semibold on an iPhone", async () => {
  await scopeChipsOn("ios", PHONE);

  const style = getComputedStyle(chip("Manga"));

  expect({ fill: style.backgroundColor, weight: style.fontWeight }).toEqual({
    fill: resolvedColour("--color-native-accent-soft", "backgroundColor"),
    weight: "590",
  });
});

test("keeps the scopes on one line that scrolls sideways when they do not fit on an iPhone", async () => {
  await scopeChipsOn("ios", NARROW_PHONE);

  const group = page.getByRole("group", { name: "Search in" }).element();
  const tops = ["Everything", "Manga", "Books"].map(
    (name) => chip(name).getBoundingClientRect().top,
  );

  expect(new Set(tops).size).toBe(1);
  expect(getComputedStyle(group).overflowX).toBe("auto");
  expect(group.scrollWidth).toBeGreaterThan(group.clientWidth);
});

test("keeps the bordered wrapping scopes on an iPad and an Android phone", async () => {
  await scopeChipsOn("ios", TABLET);
  const onIpad = getComputedStyle(chip("Everything")).borderTopWidth;
  document.body.replaceChildren();
  await scopeChipsOn("android", PHONE);
  const onAndroid = getComputedStyle(chip("Everything")).borderTopWidth;

  expect([onIpad, onAndroid]).toEqual(["1px", "1px"]);
});
