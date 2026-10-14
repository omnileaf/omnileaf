import { events, type ReadingSaved } from "#lib/ipc/bindings.ts";

type Listened<T> = (
  handler: (event: { payload: T }) => void,
) => Promise<() => void>;

function listenFor<T>(
  listen: Listened<T>,
  onHeard: (payload: T) => void,
  onListenFailed: (error: unknown) => void,
): () => void {
  const listening = listen((event) => {
    onHeard(event.payload);
  }).then(
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
