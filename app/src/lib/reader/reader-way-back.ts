import type { ResolvedPathname } from "$app/types";
import { SECTION_PATHNAMES } from "#lib/navigation/sections.ts";
import { m } from "#lib/paraglide/messages.js";

export interface OriginPage {
  readonly pathname: string;
  readonly href: ResolvedPathname;
}

export type ReaderArrival =
  | { readonly kind: "enter" }
  | { readonly kind: "fromReader" }
  | { readonly kind: "returned" }
  | { readonly kind: "fromPage"; readonly page: OriginPage };

export interface ReaderSeries {
  readonly href: string;
  readonly title: string;
  readonly isInLibrary: boolean;
}

export type ReaderWayBack =
  | { readonly kind: "history"; readonly path: string; readonly label: string }
  | { readonly kind: "replace"; readonly path: string; readonly label: string };

const NAMED_ORIGINS: Readonly<Record<string, () => string>> = {
  [SECTION_PATHNAMES.library]: m.reader_back_label,
  [SECTION_PATHNAMES.history]: m.history_back,
};

export function originAfter(
  previous: OriginPage | undefined,
  arrival: ReaderArrival,
): OriginPage | undefined {
  switch (arrival.kind) {
    case "enter":
      return undefined;
    case "fromReader":
    case "returned":
      return previous;
    case "fromPage":
      return arrival.page;
  }
}

function seriesLabel(series: ReaderSeries): string {
  return series.isInLibrary
    ? m.reader_back_to_series({ series: series.title })
    : m.reader_back_label();
}

function originLabel(origin: string, series: ReaderSeries): string {
  if (origin === series.href) {
    return seriesLabel(series);
  }
  return (NAMED_ORIGINS[origin] ?? m.reader_back)();
}

export function readerWayBack(
  origin: string | undefined,
  series: ReaderSeries,
): ReaderWayBack {
  if (origin === undefined) {
    return { kind: "replace", path: series.href, label: seriesLabel(series) };
  }
  return { kind: "history", path: origin, label: originLabel(origin, series) };
}
