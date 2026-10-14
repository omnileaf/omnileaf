import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import SearchField from "./SearchField.svelte";

test("clears the typed text and keeps the field focused", async () => {
  const typed: string[] = [];
  const screen = await render(SearchField, {
    text: "market",
    conditions: [],
    onType: (text: string) => {
      typed.push(text);
    },
    onRemove: () => undefined,
    onEscape: () => undefined,
    listId: "results",
    activeId: undefined,
    hasChoices: false,
    onKey: () => false,
  });

  await screen.getByRole("button", { name: "Clear" }).click();

  expect(typed).toEqual([""]);
  await expect.element(screen.getByRole("combobox")).toHaveFocus();
});
