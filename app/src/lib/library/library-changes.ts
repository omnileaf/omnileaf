import { events } from "$lib/ipc/bindings";

/** Calls `onChange` each time the core says the library changed, until the returned function stops listening. */
export function listenForLibraryChanges(onChange: () => void): () => void {
  const listening = events.libraryChanged.listen(() => {
    onChange();
  });
  return () => {
    void listening.then((stop) => {
      stop();
    });
  };
}
