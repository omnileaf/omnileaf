import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import LightSliders from "./LightSliders.svelte";

async function openSliders(platform: Platform): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await render(LightSliders, {
    light: { isOn: true, brightness: 40, warmth: 20 },
    onChange: () => {},
  });
}

function thumb(): HTMLElement {
  const element = page.getByRole("slider", { name: "Brightness" }).element();
  return element as HTMLElement;
}

function dimensions(element: Element, pseudo?: string): number[] {
  const style = getComputedStyle(element, pseudo);
  return [style.width, style.height].map(Number.parseFloat);
}

function root(): HTMLElement {
  return thumb().closest("[data-slider-root]") as HTMLElement;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws the light sliders as Windows's, 32 tall on a 4 track", async () => {
  await openSliders("windows");
  const track = root().firstElementChild as HTMLElement;

  expect(dimensions(root())[1]).toBe(32);
  expect(dimensions(track)[1]).toBe(4);
  expect(getComputedStyle(track).backgroundColor).toBe(
    resolvedColour("--native-color-progress-track", "backgroundColor"),
  );
});

test("draws the light sliders' thumb 18 with a 12 accent centre that grows to 14 on hover", async () => {
  await openSliders("windows");
  const handle = root().querySelector("[data-slider-thumb]") as HTMLElement;

  expect(dimensions(handle)).toEqual([18, 18]);
  expect(dimensions(handle, "::before")).toEqual([12, 12]);

  await userEvent.hover(handle);

  expect(dimensions(handle, "::before")).toEqual([14, 14]);
});

test("keeps today's 16 thumb on the other desktops", async () => {
  await openSliders("linux");
  const handle = root().querySelector("[data-slider-thumb]") as HTMLElement;

  expect(dimensions(handle)).toEqual([16, 16]);
});
