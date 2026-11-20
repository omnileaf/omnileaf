import { onNavigate, type OnNavigate } from "$app/navigation";

import { resolvedPathOf } from "#lib/navigation/app-path.ts";

import {
  type OriginPage,
  originAfter,
  type ReaderArrival,
} from "./reader-way-back";

const READER_ROUTE = "/read/[book]";

class ReaderOrigin {
  page: OriginPage | undefined = $state();

  arrive(arrival: ReaderArrival): void {
    this.page = originAfter(this.page, arrival);
  }
}

export const readerOrigin = new ReaderOrigin();

function arrivalOf(navigation: OnNavigate): ReaderArrival {
  const { from } = navigation;
  if (from === null) {
    return { kind: "enter" };
  }
  if (navigation.type === "popstate" && navigation.delta < 0) {
    return { kind: "returned" };
  }
  return from.route.id === READER_ROUTE
    ? { kind: "fromReader" }
    : {
        kind: "fromPage",
        page: { pathname: from.url.pathname, href: resolvedPathOf(from.url) },
      };
}

export function followReaderOrigin(): void {
  onNavigate((navigation) => {
    if (navigation.to?.route.id === READER_ROUTE) {
      readerOrigin.arrive(arrivalOf(navigation));
    }
  });
}
