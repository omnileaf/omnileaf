import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, expect, test } from "vitest";

import { paneArrowKeys } from "./pane-arrow-keys.ts";

let list: HTMLUListElement;
let release: (() => void) | undefined;

function link(name: string, isShown = true): HTMLAnchorElement {
  const item = document.createElement("li");
  const anchor = document.createElement("a");
  anchor.href = `#${name}`;
  anchor.textContent = name;
  item.style.display = isShown ? "" : "none";
  item.append(anchor);
  list.append(item);
  return anchor;
}

function attach(): void {
  const cleanup = paneArrowKeys(list);
  release = typeof cleanup === "function" ? cleanup : undefined;
}

function focusedName(): string | null | undefined {
  return document.activeElement?.textContent.trim();
}

beforeEach(() => {
  list = document.createElement("ul");
  document.body.append(list);
});

afterEach(() => {
  release?.();
  list.remove();
});

test("moves to the next shown item with ArrowDown and skips an item that draws no box", async () => {
  const first = link("first");
  link("skipped", false);
  link("last");
  attach();
  first.focus();

  await userEvent.keyboard("{ArrowDown}");

  expect(focusedName()).toBe("last");
});

test("leaves a key pressed with a modifier to the page", async () => {
  const first = link("first");
  link("second");
  link("third");
  attach();
  first.focus();

  await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
  await userEvent.keyboard("{Control>}{End}{/Control}");

  expect(focusedName()).toBe("first");
});

test("ignores a key pressed outside the items", async () => {
  link("first");
  attach();
  const outside = document.createElement("button");
  outside.textContent = "outside";
  document.body.append(outside);
  outside.focus();

  await userEvent.keyboard("{ArrowDown}");

  expect(focusedName()).toBe("outside");
  outside.remove();
});
