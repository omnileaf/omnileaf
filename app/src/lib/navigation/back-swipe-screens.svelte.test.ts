import { expect, test } from "vitest";

import { BackSwipeScreens } from "./back-swipe-screens.svelte";

const MOTION_ALLOWED = () => false;

test("springs back when there is no longer a way back once the swipe lands", () => {
  const screens = new BackSwipeScreens(() => false, MOTION_ALLOWED);
  screens.follow({ kind: "moved", progress: 0.7 });
  screens.follow({ kind: "released", progress: 0.7, velocity: 0 });

  screens.settled();

  expect(screens.isSettling).toBe(false);
  expect(screens.placement).toBeNull();
});

test("waits for the page it goes back to once the swipe lands", () => {
  const screens = new BackSwipeScreens(() => true, MOTION_ALLOWED);
  screens.follow({ kind: "moved", progress: 0.7 });
  screens.follow({ kind: "released", progress: 0.7, velocity: 0 });

  screens.settled();

  expect(screens.isSettling).toBe(true);
  expect(screens.placement?.current).toBe(1);
});
