import { expect, test } from "vitest";

import type { DefaultViewer, IpcError } from "#lib/ipc/bindings.ts";

import {
  ComicViewerChoice,
  type ComicViewerBackend,
} from "./default-viewer.svelte.ts";

const FAILURE: IpcError = {
  code: "defaultViewerUnavailable",
  message: "the default app for comic files could not be changed",
};

function backend(initial: DefaultViewer, makes: DefaultViewer = "omnileaf") {
  let current = initial;
  const calls: string[] = [];
  const fake: ComicViewerBackend = {
    read: () => {
      calls.push("read");
      return Promise.resolve({ status: "ok", data: current });
    },
    make: () => {
      calls.push("make");
      current = makes;
      return Promise.resolve({ status: "ok", data: null });
    },
  };
  return { fake, calls };
}

test("starts off, then reads whether Omnileaf already opens comic files", async () => {
  const { fake } = backend("omnileaf");
  const choice = new ComicViewerChoice(fake);

  expect(choice.isOn).toBe(false);
  await choice.load();

  expect(choice.isOn).toBe(true);
});

test("turns on once the system says Omnileaf opens comic files", async () => {
  const { fake, calls } = backend("somethingElse");
  const choice = new ComicViewerChoice(fake);
  await choice.load();

  await choice.turnOn();

  expect(calls).toEqual(["read", "make", "read"]);
  expect(choice.isOn).toBe(true);
});

test("stays off when the system keeps the choice to the person", async () => {
  const { fake } = backend("somethingElse", "somethingElse");
  const choice = new ComicViewerChoice(fake);
  await choice.load();

  await choice.turnOn();

  expect(choice.isOn).toBe(false);
  expect(choice.failed).toBe(false);
});

test("reports a failure to set it and stays off", async () => {
  const choice = new ComicViewerChoice({
    read: () => Promise.resolve({ status: "ok", data: "somethingElse" }),
    make: () => Promise.resolve({ status: "error", error: FAILURE }),
  });
  await choice.load();

  await choice.turnOn();

  expect(choice.isOn).toBe(false);
  expect(choice.failed).toBe(true);
});

test("clears an earlier failure when it tries again", async () => {
  let succeeds = false;
  const choice = new ComicViewerChoice({
    read: () =>
      Promise.resolve({
        status: "ok",
        data: succeeds ? "omnileaf" : "somethingElse",
      }),
    make: () => {
      if (succeeds) {
        return Promise.resolve({ status: "ok", data: null });
      }
      succeeds = true;
      return Promise.resolve({ status: "error", error: FAILURE });
    },
  });
  await choice.load();
  await choice.turnOn();

  await choice.turnOn();

  expect(choice.failed).toBe(false);
  expect(choice.isOn).toBe(true);
});
