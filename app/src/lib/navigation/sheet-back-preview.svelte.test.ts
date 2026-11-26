import { afterEach, expect, test } from "vitest";

import type { PreviewScheduler } from "./android-back-preview.svelte";
import type { BackGestureAt, BackGestureStep } from "./back-preview";
import { SheetBackPreview } from "./sheet-back-preview.svelte";

const SPRING_SETTLES_MS = 180;
const ORIGIN = "--sheet-back-origin";
const mounted: HTMLElement[] = [];

function at(progress: number): BackGestureAt {
  return { progress, edge: "left", touchY: 0.5, cornerPx: 32 };
}

const started: BackGestureStep = { kind: "started", at: at(0) };
const moved = (progress: number): BackGestureStep => ({
  kind: "moved",
  at: at(progress),
});
const ended: BackGestureStep = { kind: "ended" };

function sheetShowing(state: "open" | "closed"): HTMLElement {
  const sheet = document.createElement("div");
  sheet.dataset.state = state;
  sheet.style.cssText =
    "position: fixed; inset-inline-start: 0; inset-block-end: 0; width: 392px; height: 600px";
  for (const height of [20, 100, 300]) {
    const part = document.createElement("div");
    part.style.height = `${String(height)}px`;
    sheet.append(part);
  }
  document.body.append(sheet);
  mounted.push(sheet);
  return sheet;
}

afterEach(() => {
  for (const sheet of mounted.splice(0)) {
    sheet.remove();
  }
});

function preview(isMotionOn = true, state: "open" | "closed" = "open") {
  const element = sheetShowing(state);
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
    () => element,
    () => isMotionOn,
    scheduler,
  );
  return {
    sheet,
    element,
    apply: () => {
      element.style.cssText += `; ${sheet.style ?? ""}`;
    },
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

test("pivots each part of the sheet about the sheet's top", () => {
  const { sheet, element } = preview();

  sheet.follow(started);

  const parts = [...element.children] as HTMLElement[];
  expect(parts.map((part) => part.style.getPropertyValue(ORIGIN))).toEqual([
    "0px",
    "-20px",
    "-120px",
  ]);
});

test("leaves the sheet's own slide in the transitions while the gesture is held", () => {
  const { sheet } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));

  expect(sheet.style).toContain(
    "transition-property: translate, transform, rotate",
  );
  expect(sheet.style).not.toMatch(/transition:/);
});

test("springs the sheet and its parts back to rest when the gesture ends, then lets go of them", () => {
  const { sheet, element, apply, settle, timers } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));
  apply();

  sheet.follow(ended);

  expect(sheet.phase).toBe("cancelling");
  expect(sheet.style).toContain("scale: 1 1");
  expect(sheet.style).toContain(
    "transition-property: translate, transform, rotate",
  );
  expect(element.getAnimations({ subtree: true })).toHaveLength(4);
  expect(timers.at(-1)?.ms).toBe(SPRING_SETTLES_MS);
  settle();
  expect([sheet.phase, sheet.style]).toEqual([undefined, undefined]);
  const parts = [...element.children] as HTMLElement[];
  expect(parts.map((part) => part.style.getPropertyValue(ORIGIN))).toEqual([
    "",
    "",
    "",
  ]);
});

test("starts a new gesture from the size the sheet has reached in a spring back", () => {
  const { sheet, apply } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));
  apply();
  sheet.follow(ended);
  apply();

  sheet.follow(started);

  const [scaleX] = (sheet.style?.match(/scale: ([\d.]+) /) ?? []).slice(1);
  expect(Number(scaleX)).toBeLessThan(0.95);
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

test("stays shrunk through the slide out when back is asked to close the sheet and the sheet closes", () => {
  const { sheet, nextFrame } = preview(true, "closed");
  sheet.follow(started);
  sheet.follow(moved(1));

  sheet.closed();
  nextFrame();

  expect(sheet.phase).toBe("held");
});

test("is at rest again once the sheet has gone", () => {
  const { sheet, element, settle } = preview(true, "closed");
  sheet.follow(started);
  sheet.follow(moved(1));

  sheet.gone();
  settle();

  expect([sheet.phase, sheet.style]).toEqual([undefined, undefined]);
  const parts = [...element.children] as HTMLElement[];
  expect(parts.map((part) => part.style.getPropertyValue(ORIGIN))).toEqual([
    "",
    "",
    "",
  ]);
});

test("shrinks again from rest after the sheet has gone and come back", () => {
  const { sheet } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));
  sheet.gone();

  sheet.follow(started);

  expect(sheet.style).toContain("scale: 1 1");
});
