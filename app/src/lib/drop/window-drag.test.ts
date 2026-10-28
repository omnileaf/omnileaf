import { emit, TauriEvent } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, expect, test, vi } from "vitest";

import { listenForWindowDrag, type WindowDrag } from "./window-drag.ts";

afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
});

function listening(): { heard: WindowDrag[]; stop: () => void } {
  mockWindows("main");
  mockIPC(() => null, { shouldMockEvents: true });
  const heard: WindowDrag[] = [];
  const stop = listenForWindowDrag(
    (drag) => heard.push(drag),
    (error) => {
      throw error instanceof Error ? error : new Error(String(error));
    },
  );
  return { heard, stop };
}

async function whenListening(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
}

test("reports each stage of a drag, with positions in page pixels", async () => {
  vi.stubGlobal("devicePixelRatio", 2);
  const { heard, stop } = listening();
  await whenListening();

  await emit(TauriEvent.DRAG_ENTER, {
    paths: ["/a/One.cbz"],
    position: { x: 400, y: 200 },
  });
  await emit(TauriEvent.DRAG_OVER, { position: { x: 600, y: 300 } });
  await emit(TauriEvent.DRAG_DROP, {
    paths: ["/a/One.cbz"],
    position: { x: 600, y: 300 },
  });
  await emit(TauriEvent.DRAG_LEAVE, null);

  await expect.poll(() => heard.length).toBe(4);
  expect(heard).toEqual([
    { kind: "enter", paths: ["/a/One.cbz"], at: { x: 200, y: 100 } },
    { kind: "over", at: { x: 300, y: 150 } },
    { kind: "drop", paths: ["/a/One.cbz"], at: { x: 300, y: 150 } },
    { kind: "leave" },
  ]);
  stop();
});

test("stops reporting once stopped", async () => {
  const { heard, stop } = listening();
  await whenListening();
  stop();
  await whenListening();

  await emit(TauriEvent.DRAG_LEAVE, null);
  await whenListening();

  expect(heard).toEqual([]);
});
