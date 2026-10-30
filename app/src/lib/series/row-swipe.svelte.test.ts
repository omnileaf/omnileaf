import { afterEach, expect, test } from "vitest";

import { RowSwipe } from "./row-swipe.svelte";

const NARROW_ROW_PX = 288;
const CAPSULE = { revealPx: () => 112, actPastOpenPx: 48 };

let row: HTMLElement | undefined;

afterEach(() => {
  row?.remove();
});

function narrowRow(): HTMLElement {
  row = document.createElement("div");
  row.style.inlineSize = `${String(NARROW_ROW_PX)}px`;
  document.body.append(row);
  return row;
}

function finger(type: string, clientX: number): PointerEvent {
  return new PointerEvent(type, { pointerType: "touch", clientX, clientY: 0 });
}

function swipeFrom(
  swipe: RowSwipe,
  target: HTMLElement,
  across: number,
): ReturnType<RowSwipe["released"]> {
  swipe.pressed(finger("pointerdown", 0), "book", target);
  swipe.moved(finger("pointermove", across));
  return swipe.released(CAPSULE);
}

test("acts on a swipe a margin past how far the row sat open", () => {
  const swipe = new RowSwipe(() => true);
  const target = narrowRow();
  swipeFrom(swipe, target, 90);

  const outcome = swipeFrom(swipe, target, 60);

  expect(outcome).toEqual({ kind: "act", side: "towardEnd" });
});

test("acts on a swipe past half an open row when its action is the fixed one", () => {
  const swipe = new RowSwipe(() => true);
  const target = narrowRow();
  swipe.pressed(finger("pointerdown", 0), "book", target);
  swipe.moved(finger("pointermove", 90));
  swipe.released();

  swipe.pressed(finger("pointerdown", 0), "book", target);
  swipe.moved(finger("pointermove", 40));
  const outcome = swipe.released();

  expect(outcome).toEqual({ kind: "act", side: "towardEnd" });
});

test("opens a row on its action without a swipe, toward its start in left-to-right text", () => {
  const swipe = new RowSwipe(() => true);

  swipe.reveal("book", "towardStart", narrowRow(), CAPSULE);

  expect({
    offset: swipe.offsetOf("book"),
    side: swipe.sideOf("book"),
    isRevealed: swipe.isRevealed("book"),
  }).toEqual({ offset: -112, side: "towardStart", isRevealed: true });
});

test("opens a row on its action toward its start in right-to-left text", () => {
  const swipe = new RowSwipe(() => true);
  const target = narrowRow();
  target.dir = "rtl";

  swipe.reveal("book", "towardStart", target, CAPSULE);

  expect(swipe.offsetOf("book")).toBe(112);
});
