import { Channel, type InvokeArgs } from "@tauri-apps/api/core";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { openHandedDocuments } from "./open-handed-documents.ts";

const WATCH_OPEN_WITH = "watch_open_with";
const QUEUE_DOCUMENT_TO_OPEN = "queue_document_to_open";
const DOCUMENT = "content://documents.test/document/42";
const OTHER_DOCUMENT = "content://documents.test/document/43";
const UNREADABLE = {
  code: "bookUnreadable",
  message: "the document could not be read",
};

afterEach(() => {
  clearMocks();
});

function handDocument(args: InvokeArgs | undefined, uri: string): void {
  const channel: unknown =
    args !== undefined && "onHanded" in args ? args.onHanded : undefined;
  if (!(channel instanceof Channel)) {
    throw new Error("the command was not handed a channel for the documents");
  }
  channel.onmessage(uri);
}

function listening(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve);
  });
}

function handing(documents: string[], queue: (uri: string) => unknown): void {
  mockIPC((command, args) => {
    if (command === WATCH_OPEN_WITH) {
      for (const uri of documents) {
        handDocument(args, uri);
      }
      return null;
    }
    if (command === QUEUE_DOCUMENT_TO_OPEN) {
      return queue((args as { uri: string }).uri);
    }
    return null;
  });
}

test("queues the document Android handed to the app", async () => {
  const queued: string[] = [];
  handing([DOCUMENT], (uri) => {
    queued.push(uri);
    return null;
  });

  openHandedDocuments(
    () => () => undefined,
    () => undefined,
  );

  await expect.poll(() => queued).toEqual([DOCUMENT]);
});

test("queues each document Android hands to the running app", async () => {
  const queued: string[] = [];
  handing([DOCUMENT, OTHER_DOCUMENT], (uri) => {
    queued.push(uri);
    return null;
  });

  openHandedDocuments(
    () => () => undefined,
    () => undefined,
  );

  await expect.poll(() => queued).toEqual([DOCUMENT, OTHER_DOCUMENT]);
});

test("queues nothing when Android handed nothing", async () => {
  const queued: string[] = [];
  handing([], (uri) => {
    queued.push(uri);
    return null;
  });

  openHandedDocuments(
    () => () => undefined,
    () => undefined,
  );
  await listening();
  await listening();

  expect(queued).toEqual([]);
});

test("shows the app is busy from the hand-over until the copy is done", async () => {
  const finish: (() => void)[] = [];
  const busy: string[] = [];
  handing(
    [DOCUMENT],
    () =>
      new Promise((resolve) => {
        finish.push(() => {
          resolve(null);
        });
      }),
  );

  openHandedDocuments(
    () => {
      busy.push("started");
      return () => busy.push("stopped");
    },
    () => undefined,
  );
  await expect.poll(() => finish.length).toBe(1);
  const whileCopying = [...busy];
  finish[0]?.();
  await expect.poll(() => busy).toEqual(["started", "stopped"]);

  expect(whileCopying).toEqual(["started"]);
});

test("reports a document the core cannot read and stops showing busy", async () => {
  const busy: string[] = [];
  const failures: unknown[] = [];
  handing([DOCUMENT], () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- a failed command rejects with its plain error object, which is what the bindings read
    throw UNREADABLE;
  });

  openHandedDocuments(
    () => {
      busy.push("started");
      return () => busy.push("stopped");
    },
    (error) => failures.push(error),
  );

  await expect.poll(() => busy).toEqual(["started", "stopped"]);
  expect(failures).toEqual([UNREADABLE]);
});

test("reports a failure that is not a command's own error and stops showing busy", async () => {
  const refusal = new Error("the core stopped answering");
  const busy: string[] = [];
  const failures: unknown[] = [];
  handing([DOCUMENT], () => {
    throw refusal;
  });

  openHandedDocuments(
    () => {
      busy.push("started");
      return () => busy.push("stopped");
    },
    (error) => failures.push(error),
  );

  await expect.poll(() => busy).toEqual(["started", "stopped"]);
  expect(failures).toEqual([refusal]);
});

test("reports when Android cannot be asked for the documents it hands over", async () => {
  const refusal = new Error("the plugin refused to watch");
  mockIPC(() => {
    throw refusal;
  });
  const failures: unknown[] = [];

  openHandedDocuments(
    () => () => undefined,
    (error) => failures.push(error),
  );

  await expect.poll(() => failures).toEqual([refusal]);
});
