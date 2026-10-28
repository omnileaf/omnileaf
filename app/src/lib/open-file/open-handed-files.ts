import { resolve } from "$app/paths";
import type { ResolvedPathname } from "$app/types";
import { commands, events, type FileToRead } from "#lib/ipc/bindings.ts";
import { listenFor } from "#lib/ipc/listen-for.ts";

export function openHandedFiles(
  open: (page: ResolvedPathname) => void,
  onFailed: (error: unknown) => void,
): () => void {
  async function openNext(): Promise<void> {
    let latest: FileToRead | null = null;
    for (;;) {
      const handed = await commands.fileToOpen();
      if (handed.status === "error") {
        onFailed(handed.error);
        return;
      }
      if (handed.data === null) {
        break;
      }
      latest = handed.data;
    }
    if (latest !== null) {
      open(resolve("/read/[book]", { book: latest.book }));
    }
  }

  void openNext().catch(onFailed);
  return listenFor(
    (handler) => events.fileOpenRequested.listen(handler),
    () => {
      void openNext().catch(onFailed);
    },
    onFailed,
  );
}
