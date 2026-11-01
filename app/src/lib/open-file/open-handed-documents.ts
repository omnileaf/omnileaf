import { Channel } from "@tauri-apps/api/core";

import { commands } from "#lib/ipc/bindings.ts";

export function openHandedDocuments(
  showBusy: () => () => void,
  onFailed: (error: unknown) => void,
): void {
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
    void queue(uri).catch(onFailed);
  });
  void commands.watchOpenWith(handed).then((watching) => {
    if (watching.status === "error") {
      onFailed(watching.error);
    }
  }, onFailed);
}
