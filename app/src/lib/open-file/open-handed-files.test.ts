import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { openHandedFiles } from "./open-handed-files.ts";

const FILE_TO_OPEN = "file_to_open";
const FILE_OPEN_REQUESTED = "file-open-requested";
const BOOK = "0190a3e4-0000-8000-8000-000000000004";
const OTHER_BOOK = "0190a3e4-0000-8000-8000-000000000005";

function handing(...books: (string | null)[]): void {
  const waiting = [...books];
  mockIPC(
    (command) => {
      if (command === FILE_TO_OPEN) {
        const book = waiting.shift() ?? null;
        return book === null ? null : { book, isInLibrary: false };
      }
      return null;
    },
    { shouldMockEvents: true },
  );
}

function listening(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve);
  });
}

afterEach(() => {
  clearMocks();
});

test("opens the file the app was launched with", async () => {
  handing(BOOK);
  const opened: string[] = [];

  const stop = openHandedFiles(
    (page) => opened.push(page),
    () => undefined,
  );

  await expect.poll(() => opened).toEqual([`/read/${BOOK}`]);
  stop();
});

test("opens nothing when no file was handed to the app", async () => {
  handing(null);
  const opened: string[] = [];

  const stop = openHandedFiles(
    (page) => opened.push(page),
    () => undefined,
  );
  await listening();
  await listening();

  expect(opened).toEqual([]);
  stop();
});

test("opens each file handed to the running app", async () => {
  handing(null, OTHER_BOOK);
  const opened: string[] = [];
  const stop = openHandedFiles(
    (page) => opened.push(page),
    () => undefined,
  );
  await listening();

  await emit(FILE_OPEN_REQUESTED, null);

  await expect.poll(() => opened).toEqual([`/read/${OTHER_BOOK}`]);
  stop();
});

test("says when the file could not be opened", async () => {
  const refusal = new Error("the core refused to open the file");
  mockIPC(
    (command) => {
      if (command === FILE_TO_OPEN) {
        throw refusal;
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  const failures: unknown[] = [];

  const stop = openHandedFiles(
    () => undefined,
    (error) => failures.push(error),
  );

  await expect.poll(() => failures).toEqual([refusal]);
  stop();
});
