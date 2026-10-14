import { Channel } from "@tauri-apps/api/core";
import { afterEach, expect, test } from "vitest";

import {
  commands,
  events,
  type IpcError,
  type ScanProgress,
} from "./bindings.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import { installFakeIpc, removeFakeIpc } from "./fake-ipc.ts";
import { seriesIdIn } from "#lib/series/series-id.ts";

const MISSING_SERIES: IpcError = {
  code: "seriesNotFound",
  message: "that series isn't in the library",
};

const backend: Partial<FakeBackend> = {
  appInfo: () => ({
    version: "1.2.3",
    platform: "macos",
    sourceCode: "repo.example.org/omnileaf",
    isDevelopmentBuild: true,
  }),
  seriesOverview: () => {
    throw new CommandFailure(MISSING_SERIES);
  },
  addLibraryFolder: async (onProgress) => {
    await onProgress.send({ stage: "finding", found: 7 });
    return null;
  },
};

afterEach(() => {
  removeFakeIpc(window);
});

test("answers a command from the fake backend", async () => {
  installFakeIpc(window, backend, "/sample/");

  const info = await commands.appInfo();

  expect(info.platform).toBe("macos");
});

test("turns a command failure into the binding's error result", async () => {
  installFakeIpc(window, backend, "/sample/");

  const series = seriesIdIn("5a4d1e00-0000-4000-8000-000000000004");
  if (series === undefined) {
    throw new Error("the sample id has no id's shape");
  }

  const overview = await commands.seriesOverview(series);

  expect(overview).toEqual({ status: "error", error: MISSING_SERIES });
});

test("sends a channel's messages to the page in order", async () => {
  installFakeIpc(window, backend, "/sample/");
  const heard: ScanProgress[] = [];
  const progress = new Channel<ScanProgress>((message) => {
    heard.push(message);
  });

  await commands.addLibraryFolder(progress);

  await expect.poll(() => heard).toEqual([{ stage: "finding", found: 7 }]);
});

test("delivers events the backend emits to the page's listeners", async () => {
  const ipc = installFakeIpc(window, backend, "/sample/");
  const heard: unknown[] = [];
  await events.libraryChanged.listen(() => {
    heard.push("changed");
  });

  ipc.emit("library-changed", null);

  expect(heard).toEqual(["changed"]);
});

test("points the app's protocols at the base it was given", async () => {
  installFakeIpc(window, backend, "/sample/");
  const { convertFileSrc } = await import("@tauri-apps/api/core");

  expect(convertFileSrc("cover/04", "omni")).toBe("/sample/omni/cover%2F04");
});
