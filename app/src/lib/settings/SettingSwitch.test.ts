import { createRawSnippet } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import SettingSwitch from "./SettingSwitch.svelte";

const LABEL = "Show the label";
const DESCRIPTION = "At the top of the screen.";

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

test("shows what follows the label inside the switch", async () => {
  const screen = await render(SettingSwitch, {
    label: LABEL,
    description: DESCRIPTION,
    isOn: false,
    onToggle: () => undefined,
    trailing: createRawSnippet(() => ({ render: () => "<kbd>Ctrl H</kbd>" })),
  });

  await expect
    .element(screen.getByRole("switch", { name: LABEL }).getByText("Ctrl H"))
    .toBeVisible();
});
