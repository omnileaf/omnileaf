import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { cn, TOKEN_THEME } from "./cn.ts";

const appCss = readFileSync(new URL("../app.css", import.meta.url), "utf8");

function tokenNames(namespace: string): string[] {
  const pattern = new RegExp(
    `--${namespace}-(?!color-)([a-z0-9-]+?)(?:--[a-z-]+)?:`,
    "g",
  );
  return [
    ...new Set([...appCss.matchAll(pattern)].map((match) => match[1] ?? "")),
  ].sort();
}

test("keeps a text size and a text colour side by side", () => {
  expect(cn("text-small", "text-muted")).toBe("text-small text-muted");
});

test("lets a later text size win over an earlier one", () => {
  expect(cn("text-label text-muted", "text-title")).toBe(
    "text-muted text-title",
  );
});

test("lets a later radius token win over an earlier one", () => {
  expect(cn("rounded-control", "rounded-card")).toBe("rounded-card");
});

test("lets a later shadow token win over an earlier one", () => {
  expect(cn("shadow-card", "shadow-none")).toBe("shadow-none");
});

test("knows every token the theme defines", () => {
  for (const [namespace, names] of Object.entries(TOKEN_THEME)) {
    expect([...names], namespace).toEqual(tokenNames(namespace));
  }
});
