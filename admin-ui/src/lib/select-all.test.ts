import { expect, test } from "vitest";

import { selectAll } from "#lib/select-all.ts";

function fakeArea(value: string) {
  const calls: string[] = [];
  return {
    calls,
    area: {
      value,
      focus: () => {
        calls.push("focus");
      },
      select: () => {
        calls.push("select");
      },
      setSelectionRange: (start: number, end: number) => {
        calls.push(`range ${String(start)}-${String(end)}`);
      },
    },
  };
}

test("focuses the text, selects it, and sets the range over all of it", () => {
  const { area, calls } = fakeArea("Report R-1111-1111");

  selectAll(area);

  expect(calls).toEqual(["focus", "select", "range 0-18"]);
});

test("selects an empty text without a range past its end", () => {
  const { area, calls } = fakeArea("");

  selectAll(area);

  expect(calls).toEqual(["focus", "select", "range 0-0"]);
});

test("does nothing when there is no text area yet", () => {
  expect(() => {
    selectAll(null);
  }).not.toThrow();
});
