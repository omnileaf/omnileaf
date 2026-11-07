import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { followCorePlatform } from "#lib/page/platform.ts";

import WelcomeStep from "./WelcomeStep.svelte";

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
