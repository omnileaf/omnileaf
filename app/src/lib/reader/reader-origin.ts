import { goto, onNavigate, type OnNavigate } from "$app/navigation";
import { page } from "$app/state";

import { resolvedPathOf } from "#lib/navigation/app-path.ts";

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
  return from.route.id === READER_ROUTE_ID
    ? { kind: "fromReader", origin: page.state.readerOrigin }
    : {
        kind: "fromPage",
        page: { pathname: from.url.pathname, href: resolvedPathOf(from.url) },
      };
}

function keepOnEntry(readerOrigin: OriginPage, url: URL): Promise<void> {
  return goto(resolvedPathOf(url), {
    shallow: true,
    replace: true,
    state: { ...page.state, readerOrigin },
  });
}

export function followReaderOrigin(): void {
  onNavigate((navigation) => {
    const { to } = navigation;
    if (navigation.shallow || to?.route.id !== READER_ROUTE_ID) {
      return;
    }
    const origin = originOnArrival(arrivalOf(navigation));
    if (origin !== undefined) {
      void navigation.complete.then(() => keepOnEntry(origin, to.url));
    }
  });
}
