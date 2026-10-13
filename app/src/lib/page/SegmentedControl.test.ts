import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import SegmentedControl from "./SegmentedControl.svelte";

const OPTIONS = ["light", "dark", "system"] as const;
type Option = (typeof OPTIONS)[number];

const LABELS = {
  light: () => "Light",
  dark: () => "Dark",
  system: () => "System",
} satisfies Record<Option, () => string>;

function renderControl(chosen: Option, onChoose: (option: Option) => void) {
  return render(SegmentedControl<Option>, {
    options: OPTIONS,
    labels: LABELS,
    chosen,
    labelledBy: "theme-label",
    onChoose,
  });
}

test("checks the chosen option among its radios", async () => {
  const screen = await renderControl("dark", () => undefined);

  await expect
    .element(screen.getByRole("radio", { name: "Dark" }))
    .toBeChecked();
  await expect
    .element(screen.getByRole("radio", { name: "Light" }))
    .not.toBeChecked();
});

test("asks for the option pressed", async () => {
  const chosen: Option[] = [];
  const screen = await renderControl("light", (option) => chosen.push(option));

  await screen.getByRole("radio", { name: "System" }).click();

  expect(chosen).toEqual(["system"]);
});

test("asks for the next option with the arrow key", async () => {
  const chosen: Option[] = [];
  const screen = await renderControl("light", (option) => chosen.push(option));
  await screen.getByRole("radio", { name: "Light" }).click();

  await userEvent.keyboard("{ArrowRight}");

  expect(chosen).toEqual(["dark"]);
});

test("stays as its owner says when an option is pressed", async () => {
  const screen = await renderControl("light", () => undefined);

  await screen.getByRole("radio", { name: "Dark" }).click();

  await expect
    .element(screen.getByRole("radio", { name: "Light" }))
    .toBeChecked();
  await expect
    .element(screen.getByRole("radio", { name: "Dark" }))
    .not.toBeChecked();
});

test("announces each choice with a bubbling change, as a native radio does", async () => {
  const screen = await renderControl("light", () => undefined);
  let changes = 0;
  screen.container.addEventListener("change", () => {
    changes += 1;
  });

  await screen.getByRole("radio", { name: "Dark" }).click();
  await userEvent.keyboard("{ArrowRight}");

  expect(changes).toBe(2);
});
