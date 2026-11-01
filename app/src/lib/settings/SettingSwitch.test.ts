import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

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

async function renderOn(
  platform: Parameters<typeof followCorePlatform>[0],
  width: number,
  grouped: boolean,
): Promise<void> {
  await page.viewport(width, PHONE.height);
  followCorePlatform(platform);
  await render(SettingSwitch, {
    label: LABEL,
    description: DESCRIPTION,
    isOn: false,
    onToggle: () => undefined,
    grouped,
  });
}

function wordsOf(text: string): HTMLElement {
  const words = page.getByText(text, { exact: true }).element().parentElement;
  if (words === null) {
    throw new Error(`${text} has no words wrapper`);
  }
  return words;
}

test("keeps the Android phone row's padding, gap and plain label", async () => {
  await renderOn("android", PHONE.width, false);

  const row = getComputedStyle(page.getByRole("switch").element());

  expect(row.paddingTop).toBe("8px");
  expect(row.paddingLeft).toBe("16px");
  expect(row.paddingRight).toBe("24px");
  expect(row.columnGap).toBe("16px");
  expect(getComputedStyle(wordsOf(LABEL)).paddingTop).toBe("0px");
  expect(getComputedStyle(page.getByText(LABEL).element()).fontWeight).toBe(
    "400",
  );
});

test("keeps the iPhone row's padding, gap and medium label", async () => {
  await renderOn("ios", PHONE.width, false);

  const row = getComputedStyle(wordsOf(LABEL).parentElement ?? document.body);

  expect(row.paddingTop).toBe("12px");
  expect(row.paddingLeft).toBe("16px");
  expect(row.columnGap).toBe("12px");
  expect(getComputedStyle(page.getByText(LABEL).element()).fontWeight).toBe(
    "500",
  );
});

test("keeps the desktop row's padding, gap and medium label", async () => {
  await renderOn("windows", 700, false);

  const row = getComputedStyle(page.getByRole("switch").element());

  expect(row.paddingTop).toBe("12px");
  expect(row.paddingLeft).toBe("16px");
  expect(row.columnGap).toBe("12px");
  expect(getComputedStyle(wordsOf(LABEL)).paddingTop).toBe("0px");
});

test("draws a grouped row on the Mac 42px tall with 6px above and below its words", async () => {
  await renderOn("macos", 1280, true);

  const row = getComputedStyle(page.getByRole("switch").element());
  const label = getComputedStyle(page.getByText(LABEL).element());

  expect(row.minHeight).toBe("42px");
  expect(row.paddingTop).toBe("0px");
  expect(getComputedStyle(wordsOf(LABEL)).paddingTop).toBe("6px");
  expect(label.fontWeight).toBe("510");
  expect(label.letterSpacing).toBe("-0.08px");
});
