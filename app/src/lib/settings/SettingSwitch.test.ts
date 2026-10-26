import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import { followCorePlatform } from "#lib/page/platform.ts";

import SettingSwitch from "./SettingSwitch.svelte";

const LABEL = "Show the label";
const DESCRIPTION = "At the top of the screen.";
const PHONE = { width: 390, height: 844 };

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

test("is a switch named by its label and described by its help", async () => {
  const screen = await render(SettingSwitch, {
    label: LABEL,
    description: DESCRIPTION,
    isOn: true,
    onToggle: () => undefined,
  });

  const toggle = screen.getByRole("switch", { name: LABEL });

  await expect.element(toggle).toBeChecked();
  await expect.element(toggle).toHaveAccessibleDescription(DESCRIPTION);
});

test("asks to be toggled when pressed", async () => {
  let toggles = 0;
  const screen = await render(SettingSwitch, {
    label: LABEL,
    description: DESCRIPTION,
    isOn: false,
    onToggle: () => {
      toggles += 1;
    },
  });

  await screen.getByRole("switch", { name: LABEL }).click();

  expect(toggles).toBe(1);
});

test("stays as its owner says when pressed", async () => {
  const screen = await render(SettingSwitch, {
    label: LABEL,
    description: DESCRIPTION,
    isOn: false,
    onToggle: () => undefined,
  });
  const toggle = screen.getByRole("switch", { name: LABEL });

  await toggle.click();

  await expect.element(toggle).not.toBeChecked();
});

test("toggles from its switch alone on an iPhone, not from its words", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  followCorePlatform("ios");
  let toggles = 0;
  const screen = await render(SettingSwitch, {
    label: LABEL,
    description: DESCRIPTION,
    isOn: false,
    onToggle: () => {
      toggles += 1;
    },
  });

  await screen.getByText(LABEL).click();
  const afterWords = toggles;
  await screen.getByRole("switch", { name: LABEL }).click();

  expect(afterWords).toBe(0);
  expect(toggles).toBe(1);
  await expect
    .element(screen.getByRole("switch", { name: LABEL }))
    .toHaveAccessibleDescription(DESCRIPTION);
});
