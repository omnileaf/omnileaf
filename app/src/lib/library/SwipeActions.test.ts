import { flushSync } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { SwipeAction } from "./SwipeActions.svelte";
import SwipeActionsHarness from "./SwipeActionsHarness.svelte";

const FULL_SWIPE = 0.75;
const SHORT_SWIPE = 0.25;
const NUDGE = 0.1;

interface Acted {
  readonly actions: readonly SwipeAction[];
  readonly acted: readonly string[];
}

function renameAndDelete(deleteRunsOnFullSwipe: boolean): Acted {
  const acted: string[] = [];
  const action = (name: string, runsOnFullSwipe: boolean): SwipeAction => ({
    name,
    label: `${name} Seinen`,
    words: name,
    isDestructive: name === "delete",
    runsOnFullSwipe,
    act: () => {
      acted.push(name);
    },
  });
  return {
    actions: [action("rename", false), action("delete", deleteRunsOnFullSwipe)],
    acted,
  };
}

function swipedRow(container: HTMLElement): HTMLElement {
  const row = container.querySelector("[data-swiped]");
  if (!(row instanceof HTMLElement)) {
    throw new Error("the row has no swiped layer");
  }
  return row;
}

function openGap(row: HTMLElement): number {
  flushSync();
  const strip = row.nextElementSibling?.getBoundingClientRect().width;
  return Number.parseFloat(row.style.translate) + (strip ?? Number.NaN);
}

function swipeAcross(target: Element, share: number): void {
  const box = target.getBoundingClientRect();
  const across = box.width * share;
  const at = (moved: number): PointerEventInit => ({
    pointerType: "touch",
    pointerId: 7,
    isPrimary: true,
    bubbles: true,
    clientX: box.x + box.width / 2 + moved,
    clientY: box.y + box.height / 2,
  });
  target.dispatchEvent(new PointerEvent("pointerdown", at(0)));
  for (const moved of [across / 4, across / 2, across]) {
    target.dispatchEvent(new PointerEvent("pointermove", at(moved)));
  }
  target.dispatchEvent(new PointerEvent("pointerup", at(across)));
}

test("runs the full-swipe action when the row is swiped past half its width toward the start", async () => {
  const { actions, acted } = renameAndDelete(true);
  const { container } = await render(SwipeActionsHarness, {
    actions,
    dir: "ltr",
  });

  swipeAcross(swipedRow(container), -FULL_SWIPE);

  expect(acted).toEqual(["delete"]);
});

test("runs the full-swipe action on a swipe toward the start in right-to-left text", async () => {
  const { actions, acted } = renameAndDelete(true);
  const { container } = await render(SwipeActionsHarness, {
    actions,
    dir: "rtl",
  });

  swipeAcross(swipedRow(container), FULL_SWIPE);

  expect(acted).toEqual(["delete"]);
});

test("runs nothing on a full swipe toward the end", async () => {
  const { actions, acted } = renameAndDelete(true);
  const { container } = await render(SwipeActionsHarness, {
    actions,
    dir: "ltr",
  });

  swipeAcross(swipedRow(container), FULL_SWIPE);

  expect(acted).toEqual([]);
});

test("only opens the row on a short swipe", async () => {
  const { actions, acted } = renameAndDelete(true);
  const { container } = await render(SwipeActionsHarness, {
    actions,
    dir: "ltr",
  });

  swipeAcross(swipedRow(container), -SHORT_SWIPE);

  expect(acted).toEqual([]);
});

test("runs nothing on a full swipe when no action asks to", async () => {
  const { actions, acted } = renameAndDelete(false);
  const { container } = await render(SwipeActionsHarness, {
    actions,
    dir: "ltr",
  });

  swipeAcross(swipedRow(container), -FULL_SWIPE);

  expect(acted).toEqual([]);
});

test("keeps an open row open when it is swiped a little further toward the start", async () => {
  const { actions, acted } = renameAndDelete(true);
  const { container } = await render(SwipeActionsHarness, {
    actions,
    dir: "ltr",
  });
  swipeAcross(swipedRow(container), -SHORT_SWIPE);

  swipeAcross(swipedRow(container), -NUDGE);

  expect(acted).toEqual([]);
  expect(openGap(swipedRow(container))).toBeCloseTo(0);
});

test("runs the full-swipe action when an open row is swiped on past its actions", async () => {
  const { actions, acted } = renameAndDelete(true);
  const { container } = await render(SwipeActionsHarness, {
    actions,
    dir: "ltr",
  });
  swipeAcross(swipedRow(container), -SHORT_SWIPE);

  swipeAcross(swipedRow(container), -SHORT_SWIPE);

  expect(acted).toEqual(["delete"]);
});
