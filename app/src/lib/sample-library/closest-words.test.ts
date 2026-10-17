import { expect, test } from "vitest";

import { closestWords, slips } from "./closest-words.ts";

test("counts each letter added, dropped, changed or swapped as one slip", () => {
  expect([
    slips("harbour", "harbour"),
    slips("harbor", "harbour"),
    slips("harbiur", "harbour"),
    slips("harbuor", "harbour"),
  ]).toEqual([0, 1, 1, 1]);
});

test("finds the run of a title's words closest to as many typed", () => {
  expect(closestWords("harbor gat", "the harbour gate at night")).toEqual({
    slips: 2,
    words: "harbour gate",
  });
});
