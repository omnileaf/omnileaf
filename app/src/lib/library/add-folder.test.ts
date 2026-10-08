import { Channel, type InvokeArgs } from "@tauri-apps/api/core";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import type { FolderScan, ScanProgress } from "#lib/ipc/bindings.ts";

import { addFolderWithProgress } from "./add-folder";

const SAMPLE_SCAN: FolderScan = {
  name: "Sample Library",
  series: 3,
  books: 7,
  unreadableBooks: 0,
  unsupportedBooks: 0,
  unreadableFolders: 0,
};

afterEach(() => {
  clearMocks();
});

function reportProgress(
  args: InvokeArgs | undefined,
  progress: ScanProgress,
): void {
  const channel: unknown =
    args !== undefined && "onProgress" in args ? args.onProgress : undefined;
  if (!(channel instanceof Channel)) {
    throw new Error("the command was not handed a channel for its progress");
  }
  channel.onmessage(progress);
}

test("hands the backend a channel that passes each step of the scan on", async () => {
  const commands: string[] = [];
  mockIPC((command, args) => {
    commands.push(command);
    reportProgress(args, { stage: "reading", scanned: 3, total: 7 });
    return SAMPLE_SCAN;
  });
  const steps: ScanProgress[] = [];

  const result = await addFolderWithProgress((step) => steps.push(step));

  expect(commands).toEqual(["add_library_folder"]);
  expect(steps).toEqual([{ stage: "reading", scanned: 3, total: 7 }]);
  expect(result).toEqual({ status: "ok", data: SAMPLE_SCAN });
});
