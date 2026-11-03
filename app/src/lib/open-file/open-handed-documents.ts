import { Channel } from "@tauri-apps/api/core";

import { commands } from "#lib/ipc/bindings.ts";

export function openHandedDocuments(
  showBusy: () => () => void,
  onFailed: (error: unknown) => void,
): () => void {
  let watching = true;
  async function queue(uri: string): Promise<void> {
    const stopBusy = showBusy();
    try {
      const queued = await commands.queueDocumentToOpen(uri);
      if (queued.status === "error") {
        onFailed(queued.error);
      }
    } finally {
      stopBusy();
    }
  }

  const handed = new Channel<string>((uri) => {
    if (watching) {
      void queue(uri).catch(onFailed);
    }
  });
  void commands.watchOpenWith(handed).then((started) => {
    if (started.status === "error") {
      onFailed(started.error);
    }
  }, onFailed);
  return () => {
    watching = false;
  };
}
