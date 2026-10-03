import { events } from "$lib/ipc/bindings";

/** Calls `onChange` each time the core says the library changed, or `onListenFailed` if it can't listen, until the returned function stops listening. */
export function listenForLibraryChanges(
  onChange: () => void,
  onListenFailed: (error: unknown) => void,
): () => void {
  const listening = events.libraryChanged
    .listen(() => {
      onChange();
    })
    .then(
      (stop) => stop,
      (error: unknown) => {
        onListenFailed(error);
        return undefined;
      },
    );
  return () => {
    void listening.then((stop) => {
      stop?.();
    });
  };
}
