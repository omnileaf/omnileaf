type Listened<T> = (
  handler: (event: { payload: T }) => void,
) => Promise<() => void>;

export function listenFor<T>(
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
