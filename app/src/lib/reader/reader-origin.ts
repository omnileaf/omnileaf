import { goto, onNavigate, type OnNavigate } from "$app/navigation";
import type { ResolvedPathname } from "$app/types";
import { page } from "$app/state";

import { resolvedPathOf } from "#lib/navigation/app-path.ts";
import { reportFailure } from "#lib/errors/report-failure.ts";

import { READER_ROUTE_ID } from "./reader-route";
import {
  type OriginPage,
  originOnArrival,
  type ReaderArrival,
} from "./reader-way-back";

function arrivalOf(navigation: OnNavigate): ReaderArrival {
  const { from } = navigation;
  if (from === null || navigation.type === "popstate") {
    return { kind: "returned" };
  }
  return {
    kind: "fromPage",
    page: { pathname: from.url.pathname, href: resolvedPathOf(from.url) },
  };
}

function keepOnEntry(origin: OriginPage | undefined, url: URL): Promise<void> {
  if (origin === undefined) {
    return Promise.resolve();
  }
  return goto(resolvedPathOf(url), {
    shallow: true,
    replace: true,
    state: { ...page.state, readerOrigin: origin },
  });
}

function arrivalWasAborted(): void {
  return undefined;
}

export function followReaderOrigin(): void {
  onNavigate((navigation) => {
    const { to } = navigation;
    if (navigation.shallow || to?.route.id !== READER_ROUTE_ID) {
      return;
    }
    const arrival = arrivalOf(navigation);
    void navigation.complete
      .then(
        () =>
          keepOnEntry(
            originOnArrival(arrival, page.state.readerOrigin),
            to.url,
          ),
        arrivalWasAborted,
      )
      .catch(reportFailure);
  });
}

export function moveWithinReader(
  href: ResolvedPathname,
  state: App.PageState = {},
): Promise<void> {
  return goto(href, {
    replace: true,
    state: { ...state, readerOrigin: page.state.readerOrigin ?? null },
  }).catch(reportFailure);
}

function isPlainClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function movesWithinReader(
  href: ResolvedPathname,
): (event: MouseEvent) => void {
  return (event: MouseEvent): void => {
    if (isPlainClick(event)) {
      event.preventDefault();
      void moveWithinReader(href);
    }
  };
}
