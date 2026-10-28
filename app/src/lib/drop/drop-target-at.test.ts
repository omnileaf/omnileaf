import { afterEach, expect, test } from "vitest";

import { dropTargetAt } from "./drop-target-at.ts";

afterEach(() => {
  document.body.replaceChildren();
});

function targetBox(name: string, left: number): HTMLElement {
  const box = document.createElement("div");
  box.dataset["dropTarget"] = name;
  box.style.cssText = `position:fixed;top:0;left:${String(left)}px;width:100px;height:100px`;
  const inner = document.createElement("span");
  inner.textContent = name;
  box.append(inner);
  document.body.append(box);
  return box;
}

test("finds the target under a point, through its children", () => {
  targetBox("readNow", 0);
  targetBox("add", 200);

  expect(dropTargetAt(10, 10)).toBe("readNow");
  expect(dropTargetAt(210, 10)).toBe("add");
});

test("finds no target between them", () => {
  targetBox("readNow", 0);
  targetBox("add", 200);

  expect(dropTargetAt(150, 10)).toBeNull();
});

test("ignores an element named for something that is not a target", () => {
  targetBox("elsewhere", 0);

  expect(dropTargetAt(10, 10)).toBeNull();
});

test("finds the copying target", () => {
  targetBox("copy", 0);

  expect(dropTargetAt(10, 10)).toBe("copy");
});
