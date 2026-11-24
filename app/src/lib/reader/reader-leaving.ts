import { goto, onNavigate } from "$app/navigation";

import type { ReaderWayBack } from "./reader-way-back";

type Outcome = "arrived" | "failed";

export function readerLeaving(
  wayBack: () => ReaderWayBack,
): () => Promise<void> {
  let leaving: Promise<void> | undefined;
  let report: ((outcome: Outcome) => void) | undefined;

  onNavigate((navigation) => {
    const reportTo = report;
    report = undefined;
    if (reportTo !== undefined) {
      void navigation.complete.then(
        () => {
          reportTo("arrived");
        },
        () => {
          reportTo("failed");
        },
      );
    }
  });

  function goBackThroughHistory(): Promise<Outcome> {
    return new Promise((settle) => {
      report = settle;
      history.back();
    });
  }

  function start(): Promise<Outcome> {
    const way = wayBack();
    return way.kind === "replace"
      ? goto(way.href, { replace: true }).then(() => "arrived")
      : goBackThroughHistory();
  }

  return () => {
    leaving ??= start().then(
      (outcome) => {
        if (outcome === "failed") {
          leaving = undefined;
        }
      },
      (error: unknown) => {
        leaving = undefined;
        throw error;
      },
    );
    return leaving;
  };
}
