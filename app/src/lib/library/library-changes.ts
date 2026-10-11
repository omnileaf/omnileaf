import { events } from "#lib/ipc/bindings.ts";

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
