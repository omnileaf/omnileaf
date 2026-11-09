import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
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

  const icons = screen.container.querySelectorAll("[data-icon]");
  expect(icons[0]?.className).toContain("inline-native-icon");
});

const PHONE = { width: 400, height: 800 };
const ICON_SIZE = 24;
const ICON_TO_TEXT_GAP = 16;
const BUTTON_HEIGHT = 56;
const BUTTON_RADIUS = 28;

async function welcomeOn(platform: "android" | "ios") {
  await page.viewport(PHONE.width, PHONE.height);
  followCorePlatform(platform);
  return render(WelcomeStep, { device: "phone", onNext: () => {} });
}

test("sets each promise on the row title and subtitle type beside a bare 24px icon on Android", async () => {
  const screen = await welcomeOn("android");

  const title = screen.getByText("Reads what you already have").element();
  const icon = screen.container.querySelector('[data-icon="folder"]');
  const chip = icon?.parentElement;
  const style = getComputedStyle(title);

  expect(style.fontSize).toBe("16px");
  expect(style.lineHeight).toBe("24px");
  expect(style.fontWeight).toBe("400");
  expect(style.letterSpacing).toBe("0.5px");
  expect(chip?.getBoundingClientRect().width).toBe(ICON_SIZE);
  expect(
    title.getBoundingClientRect().left -
      (chip?.getBoundingClientRect().right ?? 0),
  ).toBe(ICON_TO_TEXT_GAP);
});

test("sets Get started at 56px with fully rounded ends on Android", async () => {
  const screen = await welcomeOn("android");

  const start = screen.getByRole("button", { name: "Get started" }).element();

  expect(start.getBoundingClientRect().height).toBe(BUTTON_HEIGHT);
  expect(
    parseFloat(getComputedStyle(start).borderTopLeftRadius),
  ).toBeGreaterThanOrEqual(BUTTON_RADIUS);
});

test("keeps Get started at the touch target height on iOS", async () => {
  const screen = await welcomeOn("ios");

  const start = screen.getByRole("button", { name: "Get started" }).element();

  expect(start.getBoundingClientRect().height).toBeLessThan(BUTTON_HEIGHT);
});
