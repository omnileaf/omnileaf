import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import {
  listenForLibraryChanges,
  listenForReadingSaved,
} from "./library-changes";

const LISTEN = "plugin:event|listen";
const READING_SAVED = "reading-saved";
const SERIES = "0190a3e4-0000-8000-8000-0000000000a4";
const OTHER_SERIES = "0190a3e4-0000-8000-8000-0000000000a5";
const BOOK = "0190a3e4-0000-8000-8000-000000000004";

function listening(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve);
  });
}

afterEach(() => {
  clearMocks();
});

test("says when it can't listen for the library's changes", async () => {
  const refusal = new Error("the core refused the listener");
  mockIPC((command) => {
    if (command === LISTEN) {
      throw refusal;
    }
    return null;
  });
  const failures: unknown[] = [];
  const stop = listenForLibraryChanges(
    () => undefined,
    (error) => {
      failures.push(error);
    },
  );

  await expect.poll(() => failures).toEqual([refusal]);
  stop();
});

test("tells of each page saved in a book of the series, and of none saved in other series", async () => {
  mockIPC(() => null, { shouldMockEvents: true });
  const saved: string[] = [];
  const stop = listenForReadingSaved(
    SERIES,
    () => {
      saved.push("saved");
    },
    () => undefined,
  );
  await listening();

  await emit(READING_SAVED, { book: BOOK, series: OTHER_SERIES });
  await emit(READING_SAVED, { book: BOOK, series: SERIES });

  await expect.poll(() => saved).toEqual(["saved"]);
  stop();
});

test("says when it can't listen for pages saved", async () => {
  const refusal = new Error("the core refused the listener");
  mockIPC((command) => {
    if (command === LISTEN) {
      throw refusal;
    }
    return null;
  });
  const failures: unknown[] = [];
  const stop = listenForReadingSaved(
    SERIES,
    () => undefined,
    (error) => {
      failures.push(error);
    },
  );

  await expect.poll(() => failures).toEqual([refusal]);
  stop();
});
