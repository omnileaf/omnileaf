import { events, type ReadingSaved } from "#lib/ipc/bindings.ts";
import { listenFor } from "#lib/ipc/listen-for.ts";

export function listenForLibraryChanges(
  onChange: () => void,
  onListenFailed: (error: unknown) => void,
): () => void {
  return listenFor(
    (handler) => events.libraryChanged.listen(handler),
    () => {
      onChange();
    },
    onListenFailed,
  );
}

export function listenForReadingSaved(
  series: string,
  onSaved: () => void,
  onListenFailed: (error: unknown) => void,
): () => void {
  return listenFor<ReadingSaved>(
    (handler) => events.readingSaved.listen(handler),
    (saved) => {
      if (saved.series === series) {
        onSaved();
      }
    },
    onListenFailed,
  );
}
