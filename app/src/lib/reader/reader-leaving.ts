import { afterNavigate, beforeNavigate, onNavigate } from "$app/navigation";
import type { ResolvedPathname } from "$app/types";
import { reportFailure } from "#lib/errors/report-failure.ts";

import { NOTHING_BENEATH_MS } from "./nothing-beneath";
import { READER_ROUTE_ID } from "./reader-route";
import type { ReaderWayBack } from "./reader-way-back";
import { navigateTo } from "#lib/navigation/navigate-to.ts";

type Outcome = "arrived" | "failed" | "nothingBeneath";

interface Watch {
  readonly started: () => void;
  readonly ended: (outcome: Outcome) => void;
}

export function readerLeaving(
  wayBack: () => ReaderWayBack,
): () => Promise<void> {
  let leaving: Promise<void> | undefined;
  let watch: Watch | undefined;

  beforeNavigate(() => {
    watch?.started();
  });

  onNavigate((navigation) => {
    const current = watch;
    if (current !== undefined) {
      void navigation.complete.then(
        () => {
          current.ended("arrived");
        },
        () => {
          current.ended("failed");
        },
      );
    }
  });

  afterNavigate((navigation) => {
    const isOwnWrite = navigation.type === "goto" && navigation.shallow;
    if (navigation.to?.route.id === READER_ROUTE_ID && !isOwnWrite) {
      leaving = undefined;
    }
  });

  function goBackThroughHistory(): Promise<Outcome> {
    return new Promise((end) => {
      let hasStarted = false;
      const noNavigation = setTimeout(() => {
        finish("nothingBeneath");
      }, NOTHING_BENEATH_MS);

      function finish(outcome: Outcome): void {
        clearTimeout(noNavigation);
        removeEventListener("popstate", popped);
        watch = undefined;
        end(outcome);
      }

      function popped(): void {
        clearTimeout(noNavigation);
        setTimeout(() => {
          if (!hasStarted) {
            finish("failed");
          }
        }, 0);
      }

      addEventListener("popstate", popped, { once: true });
      watch = {
        started: () => {
          hasStarted = true;
          clearTimeout(noNavigation);
        },
        ended: finish,
      };
      history.back();
    });
  }

  function replaceWith(href: ResolvedPathname): Promise<Outcome> {
    return navigateTo(href, { replace: true }).then(
      (): Outcome => "arrived",
      (error: unknown): Outcome => {
        reportFailure(error);
        return "failed";
      },
    );
  }

  async function start(): Promise<Outcome> {
    const way = wayBack();
    if (way.kind === "replace") {
      return replaceWith(way.href);
    }
    const outcome = await goBackThroughHistory();
    return outcome === "nothingBeneath"
      ? replaceWith(way.fallbackHref)
      : outcome;
  }

  return () => {
    leaving ??= start().then((outcome) => {
      if (outcome === "failed") {
        leaving = undefined;
      }
    });
    return leaving;
  };
}
