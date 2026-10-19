import { expect, test } from "vitest";

import { boxBetween, touchedBy } from "./drag-box";

test("spans the two corners whichever way the pointer went", () => {
  expect(boxBetween({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({
    left: 10,
    top: 20,
    width: 40,
    height: 60,
  });
});

test("names every item the box touches, even by a pixel", () => {
  const box = { left: 100, top: 100, width: 100, height: 100 };
  const items = [
    { id: "inside", left: 120, top: 120, width: 20, height: 20 },
    { id: "edge", left: 199, top: 150, width: 50, height: 50 },
    { id: "beside", left: 200, top: 150, width: 50, height: 50 },
    { id: "above", left: 120, top: 0, width: 20, height: 100 },
  ];

  expect(touchedBy(box, items)).toEqual(["inside", "edge"]);
});
