import type { ResolvedPathname } from "$app/types";
import { SECTION_PATHNAMES } from "#lib/navigation/sections.ts";
import { m } from "#lib/paraglide/messages.js";

export interface OriginPage {
  readonly pathname: string;
  readonly href: ResolvedPathname;
}

export type ReaderArrival =
  | { readonly kind: "returned" }
  | {
      readonly kind: "fromReader";
      readonly origin: OriginPage | undefined;
    }
  | { readonly kind: "fromPage"; readonly page: OriginPage };

export interface ReaderSeries {
  readonly href: ResolvedPathname;
  readonly title: string;
  readonly isInLibrary: boolean;
}

export interface ReaderWayBack {
  readonly kind: "history" | "replace";
  readonly href: ResolvedPathname;
  readonly path: string;
  readonly label: string;
  readonly genericLabel: string;
  readonly isSeries: boolean;
}

const NAMED_ORIGINS: Readonly<Record<string, () => string>> = {
  [SECTION_PATHNAMES.library]: m.reader_back_label,
  [SECTION_PATHNAMES.history]: m.history_back,
};

export function originOnArrival(
  arrival: ReaderArrival,
): OriginPage | undefined {
  switch (arrival.kind) {
    case "returned":
      return undefined;
    case "fromReader":
      return arrival.origin;
    case "fromPage":
      return arrival.page;
  }
}

function seriesLabel(series: ReaderSeries): string {
  return series.isInLibrary
    ? m.reader_back_to_series({ series: series.title })
    : m.reader_back_label();
}

function genericSeriesLabel(series: ReaderSeries): string {
  return series.isInLibrary
    ? m.reader_back_to_the_series()
    : m.reader_back_label();
}

function otherLabel(path: string): string {
  return (NAMED_ORIGINS[path] ?? m.reader_back)();
}

function wayBackTo(
  kind: ReaderWayBack["kind"],
  page: OriginPage,
  series: ReaderSeries,
): ReaderWayBack {
  const isSeries = page.pathname === series.href;
  return {
    kind,
    href: page.href,
    path: page.pathname,
    label: isSeries ? seriesLabel(series) : otherLabel(page.pathname),
    genericLabel: isSeries
      ? genericSeriesLabel(series)
      : otherLabel(page.pathname),
    isSeries,
  };
}

export function readerWayBack(
  origin: OriginPage | undefined,
  series: ReaderSeries,
): ReaderWayBack {
  return origin === undefined
    ? wayBackTo("replace", { pathname: series.href, href: series.href }, series)
    : wayBackTo("history", origin, series);
}
