import { expect, test, vi } from "vitest";

import type * as Bindings from "#lib/ipc/bindings.ts";

import type { LayoutLoadEvent } from "./$types";
import { load } from "./+layout";

const LIBRARY = "/";
const FIRST_LAUNCH = "/first-launch";

const backend = vi.hoisted(() => ({
  isLibraryOpenable: true,
  isFirstLaunchFinished: true,
  savedPage: "/settings/appearance",
}));

vi.mock("#lib/ipc/bindings.ts", async (importOriginal) => {
  const bindings = await importOriginal<typeof Bindings>();
  return {
    ...bindings,
    commands: {
      ...bindings.commands,
      appInfo: () => Promise.resolve({ platform: "linux" }),
      libraryProblem: () =>
        Promise.resolve(backend.isLibraryOpenable ? null : "couldNotOpen"),
      homeArrival: () => Promise.resolve(null),
      firstLaunchFinished: () =>
        Promise.resolve({ status: "ok", data: backend.isFirstLaunchFinished }),
      rememberAppLockWords: () => Promise.resolve({ status: "ok", data: null }),
    },
  };
});

vi.mock("#lib/navigation/restored-route.ts", () => ({
  takeRestoredRoute: () => Promise.resolve(backend.savedPage),
}));

function openingAt(pathname: string): LayoutLoadEvent {
  return {
    url: new URL(pathname, location.origin),
    params: {},
    route: { id: "/(app)" },
    data: null,
    fetch,
    setHeaders: () => undefined,
    parent: () => Promise.resolve({}),
    depends: () => undefined,
    untrack: (read) => read(),
    tracing: { enabled: false, root: {}, current: {} },
  };
}

test("hands the layout the page Android saved", async () => {
  backend.isLibraryOpenable = true;
  backend.isFirstLaunchFinished = true;

  const loaded = await load(openingAt(LIBRARY));

  expect(loaded).toHaveProperty("pageToRestore", backend.savedPage);
});

test("drops the page Android saved when the library has a problem", async () => {
  backend.isLibraryOpenable = false;
  backend.isFirstLaunchFinished = true;

  const loaded = await load(openingAt(LIBRARY));

  expect(loaded).toHaveProperty("pageToRestore", undefined);
});

test("opens first launch instead of the page Android saved", async () => {
  backend.isLibraryOpenable = true;
  backend.isFirstLaunchFinished = false;

  const loading = load(openingAt(LIBRARY));

  await expect(loading).rejects.toMatchObject({
    status: 307,
    location: FIRST_LAUNCH,
  });
});
