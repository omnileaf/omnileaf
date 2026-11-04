import type { Channel } from "@tauri-apps/api/core";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { expect, test } from "vitest";

import type { BackSwipe } from "#lib/ipc/bindings.ts";

import { backPreviewLook, previewBackGestures } from "./back-preview";

test("leaves the screen as it is before the gesture moves", () => {
  expect(backPreviewLook(0, false)).toEqual({
    scale: 1,
    cornerPx: 0,
  });
});

test("shrinks the screen to 90% and rounds its corners to 28 px by the end of the gesture", () => {
  expect(backPreviewLook(1, false)).toEqual({ scale: 0.9, cornerPx: 28 });
});

test("shrinks it halfway at half the gesture", () => {
  expect(backPreviewLook(0.5, false)).toEqual({ scale: 0.95, cornerPx: 14 });
});

test("keeps to the gesture's range however far the system reports it", () => {
  expect(backPreviewLook(-0.2, false)).toEqual(backPreviewLook(0, false));
  expect(backPreviewLook(1.4, false)).toEqual(backPreviewLook(1, false));
});

test("neither scales nor rounds with reduced motion", () => {
  expect(backPreviewLook(1, true)).toEqual({ scale: 1, cornerPx: 0 });
});

test("reports the progress of a moving gesture and nothing once it is cancelled", async () => {
  const shown: (number | undefined)[] = [];
  mockIPC((command, args) => {
    if (command === "watch_back_swipes") {
      const channel = (args as { onSwipe: Channel<BackSwipe> }).onSwipe;
      channel.onmessage({ kind: "moved", progress: 0.4 });
      channel.onmessage({ kind: "cancelled" });
    }
    return null;
  });

  previewBackGestures((progress) => {
    shown.push(progress);
  });

  await expect.poll(() => shown).toEqual([0.4, undefined]);
  clearMocks();
});
