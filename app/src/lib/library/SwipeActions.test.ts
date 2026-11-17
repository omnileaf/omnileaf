import { flushSync } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { ACT_PAST_OPEN_PX } from "#lib/series/row-swipe.svelte.ts";
import { swipeAcross } from "../../../tests/components/row-swipe-finger";
import type { SwipeSide } from "#lib/series/swipe.ts";

import type { SwipeAction } from "./SwipeActions.svelte";
import SwipeActionsHarness from "./SwipeActionsHarness.svelte";

const SHORT_SWIPE = 0.25;
const FULL_SWIPE = 0.75;
const JUST_PAST_ACTIONS_PX = 10;
const PAST_MARGIN_PX = ACT_PAST_OPEN_PX + 2;
const NUDGE_PX = ACT_PAST_OPEN_PX - 18;

interface Row {
  readonly row: HTMLElement;
  readonly widthPx: number;
  readonly actionsPx: number;
  readonly ran: readonly string[];
}

interface RowOptions {
  readonly dir?: "ltr" | "rtl";
  readonly canSwipe?: (side: SwipeSide) => boolean;
  readonly hasFullSwipe?: boolean;
}

async function renderRow({
  dir = "ltr",
  canSwipe = (side) => side === "towardStart",
  hasFullSwipe = true,
}: RowOptions = {}): Promise<Row> {
  const ran: string[] = [];
  const action = (name: string): SwipeAction => ({
    name,
    label: `${name} Seinen`,
    words: name,
    isDestructive: name === "delete",
    act: () => {
      ran.push(name);
    },
  });
  const { container } = await render(SwipeActionsHarness, {
    actions: [action("rename"), action("delete")],
    onFullSwipe: hasFullSwipe
      ? () => {
          ran.push("full swipe");
        }
      : undefined,
    canSwipe,
    dir,
  });
  const row = container.querySelector("[data-swiped]");
  const strip = row?.nextElementSibling;
  if (!(row instanceof HTMLElement) || !(strip instanceof HTMLElement)) {
    throw new Error("the row has no swiped layer or no actions");
  }
  return {
    row,
    widthPx: row.getBoundingClientRect().width,
    actionsPx: strip.getBoundingClientRect().width,
    ran,
  };
}

function openGap({ row, actionsPx }: Row): number {
  flushSync();
  return Number.parseFloat(row.style.translate) + actionsPx;
}

test("runs the full swipe when a closed row is swiped past its actions and a margin toward the start", async () => {
  const shown = await renderRow();

  swipeAcross(shown.row, -(shown.actionsPx + PAST_MARGIN_PX));

  expect(shown.ran).toEqual(["full swipe"]);
});

test("runs the full swipe on a swipe toward the start in right-to-left text", async () => {
  const shown = await renderRow({ dir: "rtl" });

  swipeAcross(shown.row, shown.actionsPx + PAST_MARGIN_PX);

  expect(shown.ran).toEqual(["full swipe"]);
});

test("only opens a closed row swiped just past its actions", async () => {
  const shown = await renderRow();

  swipeAcross(shown.row, -(shown.actionsPx + JUST_PAST_ACTIONS_PX));

  expect(shown.ran).toEqual([]);
  expect(openGap(shown)).toBeCloseTo(0);
});

test("runs nothing on a full swipe toward the end", async () => {
  const shown = await renderRow({ canSwipe: () => true });

  swipeAcross(shown.row, shown.widthPx * FULL_SWIPE);

  expect(shown.ran).toEqual([]);
});

test("only opens the row on a short swipe", async () => {
  const shown = await renderRow();

  swipeAcross(shown.row, -shown.widthPx * SHORT_SWIPE);

  expect(shown.ran).toEqual([]);
});

test("runs nothing on a full swipe without a full-swipe action", async () => {
  const shown = await renderRow({ hasFullSwipe: false });

  swipeAcross(shown.row, -shown.widthPx * FULL_SWIPE);

  expect(shown.ran).toEqual([]);
});

test("keeps an open row open when it is swiped a little further toward the start", async () => {
  const shown = await renderRow();
  swipeAcross(shown.row, -shown.widthPx * SHORT_SWIPE);

  swipeAcross(shown.row, -NUDGE_PX);

  expect(shown.ran).toEqual([]);
  expect(openGap(shown)).toBeCloseTo(0);
});

test("runs the full swipe when an open row is swiped on past the margin", async () => {
  const shown = await renderRow();
  swipeAcross(shown.row, -shown.widthPx * SHORT_SWIPE);

  swipeAcross(shown.row, -PAST_MARGIN_PX);

  expect(shown.ran).toEqual(["full swipe"]);
});
