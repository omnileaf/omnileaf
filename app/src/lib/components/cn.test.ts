import { expect, test } from "vitest";

import appCss from "../../app.css?raw";
import { cn, TOKEN_THEME } from "./cn.ts";

function tokenNames(namespace: string): string[] {
  const pattern = new RegExp(
    `--${namespace}-([a-z0-9-]+?)(?:--[a-z-]+)?:`,
    "g",
  );
  return [
    ...new Set([...appCss.matchAll(pattern)].map((match) => match[1] ?? "")),
  ].sort();
}

test("keeps a text size and a text colour side by side", () => {
  expect(cn("text-callout", "text-muted")).toBe("text-callout text-muted");
});

test("keeps a shadow and a colour side by side", () => {
  expect(cn("shadow-dialog", "bg-chip")).toBe("shadow-dialog bg-chip");
});

test("lets a later spacing token win over an earlier one", () => {
  expect(cn("p-xs gap-sm", "p-lg")).toBe("gap-sm p-lg");
});

test("lets a later text size win over an earlier one", () => {
  expect(cn("text-caption text-muted", "text-callout")).toBe(
    "text-muted text-callout",
  );
});

test("lets a later font weight win over an earlier one", () => {
  expect(cn("font-medium text-body", "font-regular")).toBe(
    "text-body font-regular",
  );
});

test("knows every token app.css defines", () => {
  for (const [namespace, names] of Object.entries(TOKEN_THEME)) {
    expect([...names], namespace).toEqual(tokenNames(namespace));
  }
});
