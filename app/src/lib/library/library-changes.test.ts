import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { listenForLibraryChanges } from "./library-changes";

const LISTEN = "plugin:event|listen";

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
