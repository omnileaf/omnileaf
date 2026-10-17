import { TauriEvent } from "@tauri-apps/api/event";
import { expect, test } from "vitest";

import {
  type DragListen,
  FolderDrops,
  folderNameOf,
} from "./folder-drops.svelte";

type Handler = (event: { payload: unknown }) => void;

function fakeWindow(): {
  listen: DragListen;
  send: (event: string, payload?: unknown) => void;
  listening: () => number;
} {
  const handlers = new Map<string, Handler>();
  return {
    listen: (event, handler) => {
      handlers.set(event, handler as Handler);
      return Promise.resolve(() => {
        handlers.delete(event);
      });
    },
    send: (event, payload = null) => {
      handlers.get(event)?.({ payload });
    },
    listening: () => handlers.size,
  };
}

const ENTER = TauriEvent.DRAG_ENTER;
const DROP = TauriEvent.DRAG_DROP;
const LEAVE = TauriEvent.DRAG_LEAVE;

test("names the folders being dragged over the window until the drag leaves", () => {
  const window = fakeWindow();
  const drops = new FolderDrops(() => Promise.resolve(), window.listen);
  drops.watch();

  window.send(ENTER, {
    paths: ["/media/usb/Comics 2"],
    position: { x: 0, y: 0 },
  });
  const dragging = drops.dragged;
  window.send(LEAVE);

  expect([dragging, drops.dragged]).toEqual([["/media/usb/Comics 2"], []]);
});

test("links each dropped folder in turn", async () => {
  const window = fakeWindow();
  const linked: string[] = [];
  const drops = new FolderDrops((folder) => {
    linked.push(folder);
    return Promise.resolve();
  }, window.listen);
  drops.watch();

  window.send(DROP, {
    paths: ["/media/usb/Comics", "D:\\Manga"],
    position: { x: 0, y: 0 },
  });
  await drops.settled();

  expect([linked, drops.dragged]).toEqual([
    ["/media/usb/Comics", "D:\\Manga"],
    [],
  ]);
});

test("stops listening once it stops watching", async () => {
  const window = fakeWindow();
  const drops = new FolderDrops(() => Promise.resolve(), window.listen);
  const stop = drops.watch();

  stop();
  await Promise.resolve();

  expect(window.listening()).toBe(0);
});

test("names a folder by the last part of its path on every system", () => {
  const names = [
    "/media/usb/Comics 2",
    "D:\\Shared\\Manga",
    "/Volumes/USB/Books/",
  ].map(folderNameOf);

  expect(names).toEqual(["Comics 2", "Manga", "Books"]);
});
