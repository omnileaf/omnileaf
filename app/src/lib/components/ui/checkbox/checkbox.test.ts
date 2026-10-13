import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import Checkbox from "./checkbox.svelte";

function fillOf(element: Element): string {
  return getComputedStyle(element).backgroundColor;
}

test("fills a box only some of whose items are picked as a ticked one, with a dash", async () => {
  await render(Checkbox, { checked: true, "aria-label": "Ticked" });
  await render(Checkbox, { indeterminate: true, "aria-label": "Some" });
  const ticked = page.getByRole("checkbox", { name: "Ticked" });
  const some = page.getByRole("checkbox", { name: "Some" });

  await expect.element(some).toHaveAttribute("aria-checked", "mixed");

  expect(fillOf(some.element())).toBe(fillOf(ticked.element()));
  expect(some.element().querySelector("svg")).not.toBeNull();
});
