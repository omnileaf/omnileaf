import { expect, test } from "vitest";

import { turnsOnScreen } from "./page-flight";

const WIDTH = 400;
const LEFT_TO_RIGHT = 1;
const RIGHT_TO_LEFT = -1;

test("shows only the page itself at rest", () => {
  const onScreen = turnsOnScreen({ from: 0, to: 0 }, WIDTH, LEFT_TO_RIGHT);

  expect(onScreen).toEqual({ low: 0, high: 0 });
});

test("brings in the page on the side a drag uncovers", () => {
  const forward = turnsOnScreen({ from: -100, to: -100 }, WIDTH, LEFT_TO_RIGHT);
  const back = turnsOnScreen({ from: 100, to: 100 }, WIDTH, LEFT_TO_RIGHT);
  const forwardRightToLeft = turnsOnScreen(
    { from: 100, to: 100 },
    WIDTH,
    RIGHT_TO_LEFT,
  );

  expect([forward, back, forwardRightToLeft]).toEqual([
    { low: 0, high: 1 },
    { low: -1, high: 0 },
    { low: 0, high: 1 },
  ]);
});

test("keeps every page a slide passes over, from where it starts to where it ends", () => {
  const oneTurn = turnsOnScreen({ from: WIDTH, to: 0 }, WIDTH, LEFT_TO_RIGHT);
  const runOfTurns = turnsOnScreen(
    { from: 2.5 * WIDTH, to: 0 },
    WIDTH,
    LEFT_TO_RIGHT,
  );

  expect([oneTurn, runOfTurns]).toEqual([
    { low: -1, high: 0 },
    { low: -3, high: 0 },
  ]);
});

test("shows only the page itself before the space is measured", () => {
  const onScreen = turnsOnScreen({ from: 100, to: 0 }, 0, LEFT_TO_RIGHT);

  expect(onScreen).toEqual({ low: 0, high: 0 });
});
