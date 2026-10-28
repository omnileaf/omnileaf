import { resolve } from "$app/paths";
import type { ResolvedPathname } from "$app/types";
import { commands, events } from "#lib/ipc/bindings.ts";
import { listenFor } from "#lib/ipc/listen-for.ts";

export function openHandedFiles(
  open: (page: ResolvedPathname) => void,
  onFailed: (error: unknown) => void,
): () => void {
  async function openNext(): Promise<void> {
    const handed = await commands.fileToOpen();
    if (handed.status === "error") {
      onFailed(handed.error);
      return;
    }
    if (handed.data !== null) {
      open(resolve("/read/[book]", { book: handed.data.book }));
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
