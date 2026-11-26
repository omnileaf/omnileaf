import { expect, test } from "vitest";

import type { PreviewScheduler } from "./android-back-preview.svelte";
import type { BackGestureAt, BackGestureStep } from "./back-preview";
import { SheetBackPreview } from "./sheet-back-preview.svelte";

const SPRING_SETTLES_MS = 180;
function sheetShowing(state: "open" | "closed"): HTMLElement {
  return {
    offsetWidth: 392,
    offsetHeight: 600,
    dataset: { state },
  } as unknown as HTMLElement;
}

function at(progress: number): BackGestureAt {
  return { progress, edge: "left", touchY: 0.5, cornerPx: 32 };
}

const started: BackGestureStep = { kind: "started", at: at(0) };
const moved = (progress: number): BackGestureStep => ({
  kind: "moved",
  at: at(progress),
});
const ended: BackGestureStep = { kind: "ended" };

function preview(isMotionOn = true, state: "open" | "closed" = "open") {
  const frames: (() => void)[] = [];
  const timers: { ms: number; run: () => void; isCancelled: boolean }[] = [];
  const scheduler: PreviewScheduler = {
    after: (ms, run) => {
      const timer = { ms, run, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    nextFrame: (run) => {
      frames.push(run);
      return () => undefined;
    },
  };
  const sheet = new SheetBackPreview(
    () => sheetShowing(state),
    () => isMotionOn,
    scheduler,
  );
  return {
    sheet,
    settle: () => {
      for (const timer of timers) {
        if (!timer.isCancelled) {
          timer.run();
        }
      }
    },
    timers,
    nextFrame: () => {
      for (const run of frames.splice(0)) {
        run();
      }
    },
  };
}

test("leaves a sheet alone until a gesture starts", () => {
  const { sheet } = preview();

  sheet.follow(moved(1));

  expect([sheet.phase, sheet.style]).toEqual([undefined, undefined]);
});

test("holds the sheet at rest when a gesture starts", () => {
  const { sheet } = preview();

  sheet.follow(started);

  expect(sheet.phase).toBe("held");
  expect(sheet.style).toContain("scale: 1 1");
});

test("shrinks the sheet about its bottom edge with the gesture and scales its content back", () => {
  const { sheet } = preview();
  sheet.follow(started);

  sheet.follow(moved(1));

  expect(sheet.style).toContain("transform-origin: 50% 100%");
  expect(sheet.style).toMatch(/scale: 0\.87\d+ 0\.96/);
  expect(sheet.style).toMatch(/--sheet-back-content: 0\.91\d+/);
});

test("does not animate the shrinking while the gesture is held", () => {
  const { sheet } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));

  expect(sheet.style).toContain(
    "transition-property: translate, transform, rotate",
  );
});

test("springs back to rest when the gesture ends, then lets go of the sheet", () => {
  const { sheet, settle, timers } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));

  sheet.follow(ended);

  expect(sheet.phase).toBe("cancelling");
  expect(sheet.style).toContain("scale: 1 1");
  expect(sheet.style).toContain("--sheet-back-settle: scale");
  expect(timers.at(-1)?.ms).toBe(SPRING_SETTLES_MS);
  settle();
  expect([sheet.phase, sheet.style]).toEqual([undefined, undefined]);
});

test("takes a new gesture over from a spring back that has not settled", () => {
  const { sheet, settle } = preview();
  sheet.follow(started);
  sheet.follow(ended);

  sheet.follow(started);
  settle();

  expect(sheet.phase).toBe("held");
});

test("does not shrink when the sheet's motion is off", () => {
  const { sheet } = preview(false);

  sheet.follow(started);
  sheet.follow(moved(1));

  expect([sheet.phase, sheet.style]).toEqual([undefined, undefined]);
});

test("ignores the end of a gesture it did not hold", () => {
  const { sheet, timers } = preview();

  sheet.follow(ended);

  expect(sheet.phase).toBeUndefined();
  expect(timers).toEqual([]);
});

test("springs back when back is asked to close the sheet and the sheet stays open", () => {
  const { sheet, nextFrame } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));

  sheet.closed();
  nextFrame();

  expect(sheet.phase).toBe("cancelling");
});

test("stays shrunk when back is asked to close the sheet and the sheet closes", () => {
  const { sheet, nextFrame } = preview(true, "closed");
  sheet.follow(started);
  sheet.follow(moved(1));

  sheet.closed();
  nextFrame();

  expect(sheet.phase).toBe("held");
});
