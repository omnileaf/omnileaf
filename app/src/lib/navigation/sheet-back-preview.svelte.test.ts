import { afterEach, expect, test } from "vitest";

import type { PreviewScheduler } from "./android-back-preview.svelte";
import type { BackGestureAt, BackGestureStep } from "./back-preview";
import { SheetBackPreview } from "./sheet-back-preview.svelte";

const SPRING_SETTLES_MS = 180;
const COMPUTED_ROUNDING = 0.0001;
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

const BODY_AT_REST_PX = 480;

function sheetShowing(
  state: "open" | "closed",
  bodyContentPx: number,
): HTMLElement {
  const sheet = document.createElement("div");
  sheet.dataset.state = state;
  sheet.style.cssText =
    "position: fixed; inset-inline-start: 0; inset-block-end: 0; width: 392px; height: 600px; display: flex; flex-direction: column";
  for (const height of [20, 100]) {
    const part = document.createElement("div");
    part.style.cssText = `flex: none; height: ${String(height)}px`;
    sheet.append(part);
  }
  const body = document.createElement("div");
  body.style.cssText = "flex: 1 1 auto; min-height: 0; overflow: auto";
  const content = document.createElement("div");
  content.style.height = `${String(bodyContentPx)}px`;
  body.append(content);
  sheet.append(body);
  document.body.append(sheet);
  mounted.push(sheet);
  return sheet;
}

afterEach(() => {
  for (const sheet of mounted.splice(0)) {
    sheet.remove();
  }
});

function preview(
  isMotionOn = true,
  state: "open" | "closed" = "open",
  bodyContentPx = 2 * BODY_AT_REST_PX,
) {
  const element = sheetShowing(state, bodyContentPx);
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
  expect(sheet.style).toContain("scale: 1;");
  expect(sheet.style).toContain("block-size: 600px");
});

test("shrinks the sheet evenly about its bottom edge and lays it out taller to keep its height", () => {
  const { sheet } = preview();
  sheet.follow(started);

  sheet.follow(moved(1));

  expect(sheet.style).toContain("transform-origin: 50% 100%");
  expect(sheet.style).toMatch(/scale: 0\.87\d+;/);
  expect(sheet.style).toMatch(/block-size: 65\d\.\d+px/);
  expect(sheet.style).toContain("max-block-size: none");
  expect(sheet.style).toContain("inset-block-start: auto");
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

test("springs the sheet back to rest when the gesture ends, then lets go of it", () => {
  const { sheet, element, apply, settle, timers } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));
  apply();

  sheet.follow(ended);

  expect(sheet.phase).toBe("cancelling");
  expect(sheet.style).toContain("scale: 1;");
  expect(sheet.style).toContain("block-size: 600px");
  expect(sheet.style).toContain(
    "transition-property: translate, transform, rotate",
  );
  expect(element.getAnimations()).toHaveLength(1);
  expect(timers.at(-1)?.ms).toBe(SPRING_SETTLES_MS);
  settle();
  expect([sheet.phase, sheet.style]).toEqual([undefined, undefined]);
  expect(element.getAnimations()).toEqual([]);
});

test("starts a new gesture from the size the sheet has reached in a spring back", () => {
  const { sheet, apply } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));
  apply();
  sheet.follow(ended);
  apply();

  sheet.follow(started);

  const [scaleX] = (sheet.style?.match(/scale: ([\d.]+);/) ?? []).slice(1);
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
  const { sheet, settle } = preview(true, "closed");
  sheet.follow(started);
  sheet.follow(moved(1));

  sheet.gone();
  settle();

  expect([sheet.phase, sheet.style]).toEqual([undefined, undefined]);
});

test("shrinks again from rest after the sheet has gone and come back", () => {
  const { sheet } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));
  sheet.gone();

  sheet.follow(started);

  expect(sheet.style).toContain("scale: 1;");
});

test("never widens the sheet during a gesture that takes over from a spring back", () => {
  const { sheet, apply } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));
  apply();
  sheet.follow(ended);
  apply();
  sheet.follow(started);
  const widthOf = () => Number(sheet.style?.match(/scale: ([\d.]+);/)?.[1]);
  const startedAt = widthOf();

  sheet.follow(moved(0.05));

  expect(widthOf()).toBeLessThan(startedAt + COMPUTED_ROUNDING);
});

test("resets the scale and the layout together when the sheet opens again before it is gone", async () => {
  const { sheet, element, nextFrame } = preview(true, "closed");
  sheet.follow(started);
  sheet.follow(moved(1));

  element.dataset.state = "open";
  await Promise.resolve();

  expect(sheet.style).toContain("scale: 1;");
  expect(sheet.style).not.toContain("block-size");
  nextFrame();
  expect([sheet.phase, sheet.style]).toEqual([undefined, undefined]);
});

test("stays shrunk while the sheet closes", async () => {
  const { sheet, element } = preview();
  sheet.follow(started);
  sheet.follow(moved(1));

  element.dataset.state = "closed";
  await Promise.resolve();

  expect(sheet.phase).toBe("held");
});

test("lays the sheet out taller by only as much as its scrolling body can fill", () => {
  const { sheet } = preview(true, "open", BODY_AT_REST_PX + 10);
  sheet.follow(started);

  sheet.follow(moved(1));

  expect(sheet.style).toContain("block-size: 610px");
});

test("lays the sheet out no taller when nothing in it scrolls", () => {
  const { sheet } = preview(true, "open", 100);
  sheet.follow(started);

  sheet.follow(moved(1));

  expect(sheet.style).toContain("block-size: 600px");
  expect(sheet.style).toMatch(/scale: 0\.87\d+;/);
});

test("puts a body back where it was scrolled once the sheet is back at rest", () => {
  const { sheet, element, apply, settle } = preview();
  const body = element.lastElementChild as HTMLElement;
  body.scrollTop = body.scrollHeight;
  const distanceFromEnd = () =>
    body.scrollHeight - body.clientHeight - body.scrollTop;
  sheet.follow(started);
  sheet.follow(moved(1));
  apply();
  const whileHeld = distanceFromEnd();

  sheet.follow(ended);
  apply();
  settle();

  expect(whileHeld).toBe(0);
  expect(distanceFromEnd()).toBe(0);
  expect(body.clientHeight).toBe(BODY_AT_REST_PX);
});

test("puts a body scrolled within the extra height back where it was", () => {
  const { sheet, element, apply, settle } = preview();
  const body = element.lastElementChild as HTMLElement;
  body.scrollTop = body.scrollHeight - body.clientHeight - 10;
  const before = body.scrollTop;
  sheet.follow(started);
  sheet.follow(moved(1));
  apply();
  const whileHeld = body.scrollTop;

  sheet.follow(ended);
  apply();
  settle();

  expect(whileHeld).toBeLessThan(before);
  expect(body.scrollTop).toBe(before);
});

test("follows the end of a body that is back at its end as the spring brings the sheet back", () => {
  const { sheet, element, apply, nextFrame } = preview();
  const body = element.lastElementChild as HTMLElement;
  body.scrollTop = body.scrollHeight;
  sheet.follow(started);
  sheet.follow(moved(1));
  apply();
  sheet.follow(ended);
  apply();

  nextFrame();

  expect(body.scrollHeight - body.clientHeight - body.scrollTop).toBe(0);
});
