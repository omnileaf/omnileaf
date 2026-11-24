import { goto, onNavigate } from "$app/navigation";

import type { ReaderWayBack } from "./reader-way-back";

export function readerLeaving(
  wayBack: () => ReaderWayBack,
): () => Promise<void> {
  let pending: Promise<void> | undefined;
  let arrived: (() => void) | undefined;

  onNavigate((navigation) => {
    const settle = arrived;
    arrived = undefined;
    if (settle !== undefined) {
      void navigation.complete.then(settle, settle);
    }
  });

  function goBackThroughHistory(): Promise<void> {
    return new Promise((settle) => {
      arrived = settle;
      history.back();
    });
  }

  function start(): Promise<void> {
    const way = wayBack();
    return way.kind === "replace"
      ? goto(way.href, { replace: true })
      : goBackThroughHistory();
  }

  return () => {
    pending ??= start().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
