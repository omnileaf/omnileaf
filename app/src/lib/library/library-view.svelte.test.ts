import { expect, test, vi } from "vitest";

import {
  DEFAULT_LIBRARY_VIEW,
  type IpcError,
  type LibraryView,
} from "$lib/ipc/bindings";

import {
  LibraryViewSetting,
  type ReadLibraryView,
  type StoreLibraryView,
} from "./library-view.svelte";

type ReadResult = Awaited<ReturnType<ReadLibraryView>>;
type StoreResult = Awaited<ReturnType<StoreLibraryView>>;

const STORED: LibraryView = {
  display: "list",
  coversPerRow: { phone: 4, tablet: 6, desktop: 9 },
  showsItemCounts: true,
  onCovers: { ...DEFAULT_LIBRARY_VIEW.onCovers, showsLanguage: true },
};
const COMPACT: LibraryView = { ...STORED, display: "compact" };
const GRID: LibraryView = { ...STORED, display: "grid" };

const FAILURE: IpcError = {
  code: "internal",
  message: "something went wrong inside the app",
};

const STORED_OK: StoreResult = { status: "ok", data: null };

function reading(result: ReadResult): ReadLibraryView {
  return () => Promise.resolve(result);
}

function storing(): StoreLibraryView {
  return () => Promise.resolve(STORED_OK);
}

/** A store that waits to be let go, recording each view it was handed. */
function heldStore(): {
  store: StoreLibraryView;
  stored: LibraryView[];
  letGo: () => void;
} {
  const stored: LibraryView[] = [];
  const waiting: (() => void)[] = [];
  return {
    stored,
    store: (view) => {
      stored.push(view);
      return new Promise((resolve) => {
        waiting.push(() => {
          resolve(STORED_OK);
        });
      });
    },
    letGo: () => {
      for (const resolve of waiting.splice(0)) {
        resolve();
      }
    },
  };
}

test("draws the view stored on this device once it is read", async () => {
  const setting = new LibraryViewSetting(
    reading({ status: "ok", data: STORED }),
    storing(),
    vi.fn(),
  );

  await setting.load();

  expect(setting.reading).toEqual({ kind: "read", view: STORED });
});

test("draws the view a new library starts with and reports why when the stored one can't be read", async () => {
  const onFailure = vi.fn();
  const setting = new LibraryViewSetting(
    reading({ status: "error", error: FAILURE }),
    storing(),
    onFailure,
  );

  await setting.load();

  expect(setting.reading).toEqual({
    kind: "read",
    view: DEFAULT_LIBRARY_VIEW,
  });
  expect(onFailure).toHaveBeenCalledWith(FAILURE);
});

test("draws a chosen view at once and stores it", async () => {
  const held = heldStore();
  const setting = new LibraryViewSetting(
    reading({ status: "ok", data: STORED }),
    held.store,
    vi.fn(),
  );
  await setting.load();

  setting.choose(COMPACT);

  expect(setting.reading).toEqual({ kind: "read", view: COMPACT });
  await vi.waitFor(() => {
    expect(held.stored).toEqual([COMPACT]);
  });
});

test("stores only the last of the views chosen while one is being stored", async () => {
  const held = heldStore();
  const setting = new LibraryViewSetting(
    reading({ status: "ok", data: STORED }),
    held.store,
    vi.fn(),
  );
  await setting.load();
  setting.choose(COMPACT);
  setting.choose(STORED);
  setting.choose(GRID);

  held.letGo();

  await vi.waitFor(() => {
    expect(held.stored).toEqual([COMPACT, GRID]);
  });
});

test("reports a view it couldn't store and keeps drawing it", async () => {
  const onFailure = vi.fn();
  const setting = new LibraryViewSetting(
    reading({ status: "ok", data: STORED }),
    () => Promise.resolve({ status: "error", error: FAILURE }),
    onFailure,
  );
  await setting.load();

  setting.choose(COMPACT);

  await vi.waitFor(() => {
    expect(onFailure).toHaveBeenCalledWith(FAILURE);
  });
  expect(setting.reading).toEqual({ kind: "read", view: COMPACT });
});

test("keeps a view chosen while the stored one was still being read", async () => {
  let answer: (result: ReadResult) => void = () => undefined;
  const setting = new LibraryViewSetting(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
    storing(),
    vi.fn(),
  );
  const loading = setting.load();

  setting.choose(COMPACT);
  answer({ status: "ok", data: STORED });
  await loading;

  expect(setting.reading).toEqual({ kind: "read", view: COMPACT });
});
