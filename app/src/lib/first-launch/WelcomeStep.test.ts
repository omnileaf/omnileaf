import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import WelcomeStep from "./WelcomeStep.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

test("renders native Icon components for promises on Android", async () => {
  followCorePlatform("android");
  const screen = await render(WelcomeStep, {
    device: "phone",
    onNext: () => {},
  });

  const icons = screen.container.querySelectorAll("[data-icon]");
  expect(icons.length).toBe(3);
  expect(screen.container.querySelector('[data-icon="folder"]')).not.toBeNull();
  expect(
    screen.container.querySelector('[data-icon="sparkles"]'),
  ).not.toBeNull();
  expect(screen.container.querySelector('[data-icon="lock"]')).not.toBeNull();
});

test("styles hero icon and promises for Android", async () => {
  followCorePlatform("android");
  const screen = await render(WelcomeStep, {
    device: "phone",
    onNext: () => {},
  });

  const appIcon = screen.container.querySelector("img");
  expect(appIcon?.className).toContain("rounded-full");

  const title = screen.container.querySelector("h1");
  expect(title?.className).toContain(
    "android:max-medium:text-native-first-launch-title/native-first-launch-title",
  );

  const tiles = screen.container.querySelectorAll("li span");
  expect(tiles[0]?.className).toContain("android:bg-transparent");

  const icons = screen.container.querySelectorAll("[data-icon]");
  expect(icons[0]?.className).toContain("inline-native-icon");
});
