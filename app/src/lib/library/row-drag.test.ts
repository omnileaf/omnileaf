import { expect, test } from "vitest";

import { RowDrag, type Slot } from "./row-drag.ts";

const ROW = 72;
const SLOTS: readonly Slot[] = [0, 1, 2, 3].map((at) => ({
  top: 100 + at * ROW,
  height: ROW,
}));
const START = 100 + ROW + ROW / 2;

test("follows the pointer while it stays over the list", () => {
  const drag = new RowDrag(1, SLOTS, START).to(START + 30);

  expect(drag.offset).toBe(30);
});

test("stops the row at either end of the list however far the pointer goes", () => {
  const drag = new RowDrag(1, SLOTS, START);

  expect(drag.to(START + 1000).offset).toBe(2 * ROW);
  expect(drag.to(START - 1000).offset).toBe(-ROW);
});

test("leaves the gap where the row started until its leading edge passes another row's middle", () => {
  const drag = new RowDrag(1, SLOTS, START);

  expect(drag.to(START + ROW / 2 - 1).gap).toBe(1);
  expect(drag.to(START + ROW / 2 + 1).gap).toBe(2);
  expect(drag.to(START - ROW / 2 - 1).gap).toBe(0);
  expect(drag.to(START + 1000).gap).toBe(3);
});

test("slides the rows between the start and the gap up to make room below", () => {
  const drag = new RowDrag(1, SLOTS, START).to(START + 2 * ROW);

  expect([0, 2, 3].map((at) => drag.shiftOf(at))).toEqual([0, -ROW, -ROW]);
});

test("slides the rows between the gap and the start down to make room above", () => {
  const drag = new RowDrag(2, SLOTS, START + ROW).to(START - ROW);

  expect([0, 1, 3].map((at) => drag.shiftOf(at))).toEqual([ROW, ROW, 0]);
});

test("moves no other row while the gap is where the row started", () => {
  const drag = new RowDrag(1, SLOTS, START).to(START + 10);

  expect([0, 2, 3].map((at) => drag.shiftOf(at))).toEqual([0, 0, 0]);
});

test("measures room by the dragged row's own height when rows differ", () => {
  const slots = [
    { top: 0, height: 50 },
    { top: 50, height: 90 },
    { top: 140, height: 50 },
  ];
  const drag = new RowDrag(1, slots, 95).to(95 + 200);

  expect(drag.offset).toBe(50);
  expect(drag.gap).toBe(2);
  expect(drag.shiftOf(2)).toBe(-90);
});

test("drags the first row down past the others but never above the list", () => {
  const top = 100 + ROW / 2;
  const drag = new RowDrag(0, SLOTS, top);

  expect(drag.to(top - 1000).offset).toBe(0);
  expect(drag.to(top - 1000).gap).toBe(0);
  expect(drag.to(top + 1000).offset).toBe(3 * ROW);
  expect(drag.to(top + 1000).gap).toBe(3);
  expect([1, 2, 3].map((at) => drag.to(top + 1000).shiftOf(at))).toEqual([
    -ROW,
    -ROW,
    -ROW,
  ]);
});

test("drags the last row up past the others but never below the list", () => {
  const bottom = 100 + 3 * ROW + ROW / 2;
  const drag = new RowDrag(3, SLOTS, bottom);

  expect(drag.to(bottom + 1000).offset).toBe(0);
  expect(drag.to(bottom + 1000).gap).toBe(3);
  expect(drag.to(bottom - 1000).offset).toBe(-3 * ROW);
  expect(drag.to(bottom - 1000).gap).toBe(0);
  expect([0, 1, 2].map((at) => drag.to(bottom - 1000).shiftOf(at))).toEqual([
    ROW,
    ROW,
    ROW,
  ]);
});
