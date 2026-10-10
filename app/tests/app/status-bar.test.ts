import { expect, test } from "vitest";

import { isMiddleOfScreenDark, readStatusBar } from "./status-bar.ts";

type Colour = readonly [red: number, green: number, blue: number];

const LIGHT_PAGE: Colour = [0xfa, 0xf8, 0xf4];
const DARK_PAGE: Colour = [0x16, 0x15, 0x12];
const BLACK: Colour = [0, 0, 0];
const WHITE: Colour = [0xff, 0xff, 0xff];
const SIZE = 100;
const CLOCK = { left: 10, top: 2, right: 20, bottom: 4 };
const HEADER_BYTES = 138;

function isInClock(x: number, y: number): boolean {
  return (
    x >= CLOCK.left && x < CLOCK.right && y >= CLOCK.top && y < CLOCK.bottom
  );
}

function bitmap(page: Colour, clock: Colour, isTopDown = true): Buffer {
  const bytes = Buffer.alloc(HEADER_BYTES + SIZE * SIZE * 4);
  bytes.write("BM", 0, "ascii");
  bytes.writeUInt32LE(bytes.length, 2);
  bytes.writeUInt32LE(HEADER_BYTES, 10);
  bytes.writeUInt32LE(124, 14);
  bytes.writeInt32LE(SIZE, 18);
  bytes.writeInt32LE(isTopDown ? -SIZE : SIZE, 22);
  bytes.writeUInt16LE(1, 26);
  bytes.writeUInt16LE(32, 28);
  for (let y = 0; y < SIZE; y += 1) {
    const row = isTopDown ? y : SIZE - 1 - y;
    for (let x = 0; x < SIZE; x += 1) {
      const [red, green, blue] = isInClock(x, y) ? clock : page;
      bytes.set([blue, green, red, 0xff], HEADER_BYTES + (row * SIZE + x) * 4);
    }
  }
  return bytes;
}

test("finds a black clock readable on a light page", () => {
  expect(readStatusBar(bitmap(LIGHT_PAGE, BLACK)).contrast).toBeGreaterThan(
    0.9,
  );
});

test("finds a white clock readable on a dark page", () => {
  expect(readStatusBar(bitmap(DARK_PAGE, WHITE)).contrast).toBeGreaterThan(0.9);
});

test("finds a white clock unreadable on a light page", () => {
  expect(readStatusBar(bitmap(LIGHT_PAGE, WHITE)).contrast).toBeLessThan(0.1);
});

test("finds a black clock unreadable on a dark page", () => {
  expect(readStatusBar(bitmap(DARK_PAGE, BLACK)).contrast).toBeLessThan(0.1);
});

test("reads a bitmap stored from the bottom row up", () => {
  expect(
    readStatusBar(bitmap(LIGHT_PAGE, BLACK, false)).contrast,
  ).toBeGreaterThan(0.9);
});

test("sees a dark page behind the clock", () => {
  expect(readStatusBar(bitmap(DARK_PAGE, WHITE)).isPageDark).toBe(true);
});

test("sees a light page behind the clock", () => {
  expect(readStatusBar(bitmap(LIGHT_PAGE, BLACK)).isPageDark).toBe(false);
});

test("sees a dark middle of the screen", () => {
  expect(isMiddleOfScreenDark(bitmap(DARK_PAGE, WHITE))).toBe(true);
});

test("sees a light middle of the screen", () => {
  expect(isMiddleOfScreenDark(bitmap(LIGHT_PAGE, BLACK))).toBe(false);
});
