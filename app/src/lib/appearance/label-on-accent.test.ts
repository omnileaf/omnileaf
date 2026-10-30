import { expect, test } from "vitest";

import { BLACK, labelOn, WHITE } from "./label-on-accent";

const LIGHT_YELLOW = 0xfff176;
const DARK_NAVY = 0x1a237e;
const MID_GREY = 0x767676;
const DIM_GREY = 0x777777;

test("keeps the preferred label on a fill it reads well on", () => {
  expect([labelOn(DARK_NAVY, WHITE), labelOn(LIGHT_YELLOW, BLACK)]).toEqual([
    WHITE,
    BLACK,
  ]);
});

test("writes in black on a light fill where white would not read", () => {
  expect(labelOn(LIGHT_YELLOW, WHITE)).toBe(BLACK);
});

test("writes in white on a dark fill where black would not read", () => {
  expect(labelOn(DARK_NAVY, BLACK)).toBe(WHITE);
});

test("keeps the preferred label where both would read", () => {
  expect([labelOn(MID_GREY, WHITE), labelOn(MID_GREY, BLACK)]).toEqual([
    WHITE,
    BLACK,
  ]);
});

test("takes the clearer label where neither reaches the text ratio", () => {
  expect(labelOn(DIM_GREY, WHITE)).toBe(BLACK);
});
