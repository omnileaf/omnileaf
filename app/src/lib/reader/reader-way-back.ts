import type { ResolvedPathname } from "$app/types";
import { SECTION_PATHNAMES } from "#lib/navigation/sections.ts";
import { m } from "#lib/paraglide/messages.js";

export interface OriginPage {
  readonly pathname: string;
  readonly href: ResolvedPathname;
}

export type ReaderArrival =
  | { readonly kind: "returned" }
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
  readonly fallbackHref: ResolvedPathname;
  readonly label: string;
  readonly genericLabel: string;
  readonly isSeries: boolean;
}

const NAMED_ORIGINS: Readonly<Record<string, () => string>> = {
  [SECTION_PATHNAMES.library]: m.reader_back_label,
  [SECTION_PATHNAMES.history]: m.reader_back_to_history,
};

export function originOnArrival(
  arrival: ReaderArrival,
  kept: OriginPage | null | undefined,
): OriginPage | undefined {
  return arrival.kind === "fromPage" && kept === undefined
    ? arrival.page
    : undefined;
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
  const other = isSeries ? undefined : otherLabel(page.pathname);
  return {
    kind,
    href: page.href,
    path: page.pathname,
    fallbackHref: series.href,
    label: other ?? seriesLabel(series),
    genericLabel: other ?? genericSeriesLabel(series),
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
