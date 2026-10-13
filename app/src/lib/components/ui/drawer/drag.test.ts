import { expect, test } from "vitest";

import {
  backdropOpacity,
  dragStartFrom,
  isDismissed,
  sheetOffset,
} from "./drag";

const SHEET_HEIGHT = 400;

test("waits for a finger to travel past the touch slop before deciding", () => {
  expect(dragStartFrom({ x: 0, y: 10 }, "touch")).toBe("undecided");
});

test("starts dragging once a finger travels down past the touch slop", () => {
  expect(dragStartFrom({ x: 3, y: 11 }, "touch")).toBe("dragging");
});

test("starts dragging a mouse after a much shorter travel", () => {
  expect(dragStartFrom({ x: 0, y: 3 }, "mouse")).toBe("dragging");
});

test("leaves a mostly sideways travel to the content", () => {
  expect(dragStartFrom({ x: 20, y: 12 }, "touch")).toBe("abandoned");
});

test("starts dragging on a travel upwards too, so the sheet can resist it", () => {
  expect(dragStartFrom({ x: 0, y: -12 }, "touch")).toBe("dragging");
});

test("follows the finger one to one on the way down", () => {
  expect(sheetOffset(120)).toBe(120);
});

test("holds the sheet still on a short pull upwards", () => {
  expect(sheetOffset(-6)).toBe(0);
});

test("lets the sheet rise only a little however far it is pulled up", () => {
  const rise = -sheetOffset(-100);

  expect(rise).toBeGreaterThan(0);
  expect(rise).toBeLessThan(25);
  expect(-sheetOffset(-400)).toBeLessThan(35);
});

test("keeps the backdrop whole while the sheet is in place or raised", () => {
  expect(backdropOpacity(0, SHEET_HEIGHT)).toBe(1);
  expect(backdropOpacity(-20, SHEET_HEIGHT)).toBe(1);
});

test("fades the backdrop with the share of the sheet dragged away", () => {
  expect(backdropOpacity(100, SHEET_HEIGHT)).toBeCloseTo(0.75);
});

test("clears the backdrop once the sheet is dragged off its whole height", () => {
  expect(backdropOpacity(SHEET_HEIGHT * 2, SHEET_HEIGHT)).toBe(0);
});

test("closes when let go past a quarter of the sheet's height", () => {
  expect(
    isDismissed({ offset: 100, sheetHeight: SHEET_HEIGHT, elapsedMs: 1000 }),
  ).toBe(true);
});

test("springs back when let go slowly before a quarter of its height", () => {
  expect(
    isDismissed({ offset: 99, sheetHeight: SHEET_HEIGHT, elapsedMs: 1000 }),
  ).toBe(false);
});

test("closes on a quick flick down, however short", () => {
  expect(
    isDismissed({ offset: 40, sheetHeight: SHEET_HEIGHT, elapsedMs: 80 }),
  ).toBe(true);
});

test("springs back when let go raised, however quickly", () => {
  expect(
    isDismissed({ offset: -10, sheetHeight: SHEET_HEIGHT, elapsedMs: 5 }),
  ).toBe(false);
});
