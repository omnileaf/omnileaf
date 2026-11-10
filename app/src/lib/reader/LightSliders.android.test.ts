import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import LightSliders from "./LightSliders.svelte";
import type { ReaderLight } from "./reader-settings.svelte.ts";

const PHONE = { width: 400, height: 800 };
const TABLET = { width: 820, height: 1180 };
const ROOT_HEIGHT = 44;
const TRACK_HEIGHT = 16;
const HANDLE = [4, 44];

async function openSliders(
  platform: Platform,
  viewport = PHONE,
  onChange: (light: ReaderLight) => void = () => undefined,
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await page.viewport(viewport.width, viewport.height);
  await render(LightSliders, {
    light: { isOn: true, brightness: 40, warmth: 20 },
    onChange,
  });
}

function root(name = "Brightness"): HTMLElement {
  const slider = page.getByRole("slider", { name }).element();
  const found = slider.closest("[data-slider-root]");
  if (!(found instanceof HTMLElement)) {
    throw new Error(`the ${name} slider drew no root`);
  }
  return found;
}

function handleOf(sliderRoot: HTMLElement): HTMLElement {
  const handle = sliderRoot.querySelector("[data-progress-thumb]");
  if (!(handle instanceof HTMLElement)) {
    throw new Error("the slider drew no handle");
  }
  return handle;
}

function barOf(sliderRoot: HTMLElement): HTMLElement {
  const bar = handleOf(sliderRoot).previousElementSibling;
  if (!(bar instanceof HTMLElement)) {
    throw new Error("the slider drew no bar");
  }
  return bar;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws the Android phone light sliders 44 tall around a 16 tall bar", async () => {
  await openSliders("android");
  const bar = root().querySelector(
    "[data-progress-thumb]",
  )?.previousElementSibling;

  expect(root().getBoundingClientRect().height).toBe(ROOT_HEIGHT);
  expect(bar?.getBoundingClientRect().height).toBe(TRACK_HEIGHT);
});

test("draws the Android phone light sliders' handle as a 4 by 44 bar", async () => {
  await openSliders("android");
  const handle = root().querySelector("[data-progress-thumb]");

  const box = handle?.getBoundingClientRect();
  expect([box?.width, box?.height]).toEqual(HANDLE);
});

test.each(["Brightness", "Warmth"])(
  "centres the Android phone %s handle on its bar's height",
  async (name) => {
    await openSliders("android");

    const sliderRoot = root(name);

    const handle = handleOf(sliderRoot).getBoundingClientRect();
    const bar = barOf(sliderRoot).getBoundingClientRect();

    expect(handle.top + handle.height / 2).toBeCloseTo(
      bar.top + bar.height / 2,
      0,
    );
  },
);

test("keeps the round thumb on an Android tablet", async () => {
  await openSliders("android", TABLET);

  expect(root().querySelector("[data-progress-thumb]")).toBeNull();
});

test("sets the Android phone light sliders' handle at the brightness along the bar", async () => {
  await openSliders("android");
  const box = root().getBoundingClientRect();
  const handle = root()
    .querySelector("[data-progress-thumb]")
    ?.getBoundingClientRect();

  const centre = (handle?.left ?? 0) + (handle?.width ?? 0) / 2;
  expect((centre - box.left) / box.width).toBeCloseTo(0.4, 1);
});

test("passes the brightness one step up when the Android phone slider takes an arrow key", async () => {
  const onChange = vi.fn();
  await openSliders("android", PHONE, onChange);

  page.getByRole("slider", { name: "Brightness" }).element().focus();
  await userEvent.keyboard("{ArrowRight}");

  expect(onChange).toHaveBeenLastCalledWith({
    isOn: true,
    brightness: 41,
    warmth: 20,
  });
});

test("keeps the round thumb on an iPhone", async () => {
  await openSliders("ios");

  expect(root().querySelector("[data-progress-thumb]")).toBeNull();
});
