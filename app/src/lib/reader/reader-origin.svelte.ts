import { onNavigate, type OnNavigate } from "$app/navigation";

import { resolvedPathOf } from "#lib/navigation/app-path.ts";

import {
  type OriginPage,
  originOnArrival,
  type ReaderArrival,
} from "./reader-way-back";
import { READER_ROUTE_ID } from "./reader-route";

class ReaderOrigin {
  page: OriginPage | undefined = $state();

  arrive(arrival: ReaderArrival): void {
    this.page = originOnArrival(arrival) ?? this.page;
  }
}

export const readerOrigin = new ReaderOrigin();

function arrivalOf(navigation: OnNavigate): ReaderArrival {
  const { from } = navigation;
  if (from === null) {
    return { kind: "returned" };
  }
  if (navigation.type === "popstate" && navigation.delta < 0) {
    return { kind: "returned" };
  }
  return from.route.id === READER_ROUTE_ID
    ? { kind: "fromReader", origin: readerOrigin.page }
    : {
        kind: "fromPage",
        page: { pathname: from.url.pathname, href: resolvedPathOf(from.url) },
      };
}

export function followReaderOrigin(): void {
  onNavigate((navigation) => {
    if (navigation.to?.route.id === READER_ROUTE_ID) {
      readerOrigin.arrive(arrivalOf(navigation));
    }
  });
}
