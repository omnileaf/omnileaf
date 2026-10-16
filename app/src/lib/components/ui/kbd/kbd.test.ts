import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { createRawSnippet } from "svelte";

import "../../../../app.css";

import Kbd from "./kbd.svelte";

const KEY_HEIGHT = 20;
const KEY_MIN_WIDTH = 20;

function resolved(token: string, property: "color" | "backgroundColor"): string {
  const probe = document.createElement("span");
  probe.style[property] = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe)[property];
  probe.remove();
  return colour;
}

function key(label: string) {
  return createRawSnippet(() => ({ render: () => `<span>${label}</span>` }));
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test("sets a key on the muted chip in the foreground colour, without an edge", async () => {
  document.documentElement.dataset.platform = "windows";
  document.documentElement.dataset.theme = "light";
  await render(Kbd, { children: key("Esc") });

  const chip = page.getByText("Esc").element().closest("kbd");
  const style = chip && getComputedStyle(chip);

  expect(style?.borderTopWidth).toBe("0px");
  expect(style?.backgroundColor).toBe(resolved("--muted", "backgroundColor"));
  expect(style?.color).toBe(resolved("--foreground", "color"));
  expect(style?.fontWeight).toBe("500");
});

test("draws a single key as a 20px square at least", async () => {
  await render(Kbd, { children: key("K") });

  const chip = page.getByText("K").element().closest("kbd");
  const box = chip?.getBoundingClientRect();

  expect(box?.height).toBeCloseTo(KEY_HEIGHT, 0);
  expect(box?.width).toBeGreaterThanOrEqual(KEY_MIN_WIDTH);
});
