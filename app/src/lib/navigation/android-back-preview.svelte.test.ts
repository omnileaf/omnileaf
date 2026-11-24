import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AndroidBackPreview } from "./android-back-preview.svelte";
import { ANDROID_BACK_MOTION, type BackGestureAt } from "./back-preview";

const ANDROID_SPRING_SETTLES_MS = 180;
const AREA = { left: 0, top: 0, width: 400, height: 800 };
const LOOK = { isMotionReduced: () => false };
const COPY = { content: {} as HTMLElement, scrollTop: 0 };

function screen(): HTMLElement {
  return { getBoundingClientRect: () => AREA } as unknown as HTMLElement;
}

function at(progress: number): BackGestureAt {
  return { progress, edge: "left", touchY: 0.5, cornerPx: 32 };
}

function swipedTo(preview: AndroidBackPreview, progress: number): void {
  preview.follow({ kind: "started", at: at(0) }, screen());
  preview.follow({ kind: "moved", at: at(progress) }, screen());
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("follows a gesture with the page's place and the screen's corners", () => {
  const preview = new AndroidBackPreview(LOOK);

  swipedTo(preview, 1);

  expect(preview.phase).toBe("following");
  expect(preview.frame?.closing).toEqual({ scale: 0.9, x: 12, y: 0 });
  expect(preview.cornerPx).toBe(32);
});

test("springs back when the gesture is cancelled, then rests", () => {
  const preview = new AndroidBackPreview(LOOK);
  swipedTo(preview, 1);

  preview.follow({ kind: "ended" }, screen());
  const whileCancelling = preview.phase;
  vi.advanceTimersByTime(ANDROID_SPRING_SETTLES_MS);

  expect(whileCancelling).toBe("cancelling");
  expect(preview.phase).toBe("resting");
});

test("springs back for as long as Android's back progress spring takes to settle", () => {
  const preview = new AndroidBackPreview(LOOK);
  swipedTo(preview, 1);
  preview.follow({ kind: "ended" }, screen());

  vi.advanceTimersByTime(ANDROID_SPRING_SETTLES_MS - 1);
  const justBefore = preview.phase;
  vi.advanceTimersByTime(1);

  expect(justBefore).toBe("cancelling");
  expect(preview.phase).toBe("resting");
});

test("lets the page leave from where the gesture left it once back goes through", () => {
  const preview = new AndroidBackPreview(LOOK);
  swipedTo(preview, 1);

  preview.navigationGoesAhead(COPY);

  expect(preview.phase).toBe("committing");
  expect(preview.commit).toMatchObject({
    from: { scale: 0.9, x: 12, y: 0 },
    to: { scale: 1, x: 128, y: 0 },
    scrimOpacity: 1,
  });
  expect(preview.commit?.enteringFrom).toEqual({ scale: 0.9, x: -96, y: 0 });
});

test("rests once the page has finished leaving", () => {
  const preview = new AndroidBackPreview(LOOK);
  swipedTo(preview, 1);
  preview.navigationGoesAhead(COPY);

  vi.advanceTimersByTime(ANDROID_BACK_MOTION.commitMs);

  expect(preview.phase).toBe("resting");
  expect(preview.commit).toBeUndefined();
});

test("has no page to let leave when no gesture was moving", () => {
  const preview = new AndroidBackPreview(LOOK);

  preview.navigationGoesAhead(COPY);

  expect(preview.phase).toBe("resting");
});

test("keeps square corners with reduced motion", () => {
  const preview = new AndroidBackPreview({
    ...LOOK,
    isMotionReduced: () => true,
  });

  swipedTo(preview, 1);

  expect(preview.cornerPx).toBe(0);
});

test("follows no moves of a gesture that has ended until another starts", () => {
  const preview = new AndroidBackPreview(LOOK);
  swipedTo(preview, 1);
  preview.follow({ kind: "ended" }, screen());
  vi.advanceTimersByTime(ANDROID_SPRING_SETTLES_MS);

  preview.follow({ kind: "moved", at: at(0.5) }, screen());

  expect(preview.phase).toBe("resting");
  expect(preview.frame).toBeUndefined();
});

test("takes the page that was leaving away when another gesture starts", () => {
  const preview = new AndroidBackPreview(LOOK);
  swipedTo(preview, 1);
  preview.navigationGoesAhead(COPY);

  preview.follow({ kind: "started", at: at(0) }, screen());

  expect(preview.phase).toBe("following");
  expect(preview.commit).toBeUndefined();
  expect(preview.commit?.enteringFrom).toBeUndefined();
});

test("lets the page leave where it stands with reduced motion", () => {
  const preview = new AndroidBackPreview({
    ...LOOK,
    isMotionReduced: () => true,
  });
  swipedTo(preview, 1);

  preview.navigationGoesAhead(COPY);

  expect(preview.commit?.to).toEqual({ scale: 1, x: 0, y: 0 });
});

test("keeps following a gesture that started while the page went back", () => {
  const preview = new AndroidBackPreview(LOOK);
  swipedTo(preview, 1);
  preview.navigationGoesAhead(COPY);
  preview.follow({ kind: "started", at: at(0) }, screen());

  preview.navigationArrived();

  expect(preview.phase).toBe("following");
});
