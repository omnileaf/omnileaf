import { expect, test } from "vitest";

import theme from "../../app.css?raw";
import { showsSectionsBeside } from "./panes";

function variantRule(name: string): string {
  const rule = new RegExp(
    `@custom-variant ${name} (\\{[\\s\\S]*?\\n\\}|[^\\n]+)`,
  ).exec(theme)?.[1];
  if (rule === undefined) {
    throw new Error(`the stylesheet has no ${name} variant`);
  }
  return rule.replace(/\s+/g, " ");
}

test("shows two panes from the expanded width only, as the stylesheet does", () => {
  expect(variantRule("two-pane")).toBe("{ @variant expanded { @slot; } }");
});

test("shows the sections beside the open one from the expanded width", () => {
  expect(showsSectionsBeside("expanded")).toBe(true);
});

test("folds the sections away at the medium width, where Settings opens on its list", () => {
  expect(showsSectionsBeside("medium")).toBe(false);
});

test("keeps the sections to their own page at the compact width", () => {
  expect(showsSectionsBeside("compact")).toBe(false);
});
