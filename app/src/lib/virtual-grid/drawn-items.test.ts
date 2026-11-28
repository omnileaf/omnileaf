import { expect, test } from "vitest";

import { itemsDrawnIn } from "./drawn-items";

function holderOf(html: string): Element {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return holder;
}

test("counts a grid's items from its start through the last one drawn", () => {
  const holder = holderOf(
    `<ul><li aria-posinset="41"></li><li aria-posinset="42"></li><li aria-posinset="43"></li></ul>`,
  );

  expect(itemsDrawnIn(holder)).toBe(43);
});

test("counts none in a holder with no grid drawn", () => {
  expect(itemsDrawnIn(holderOf("<p>No series</p>"))).toBe(0);
});
