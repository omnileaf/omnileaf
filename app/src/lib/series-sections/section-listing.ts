import type {
  BookSection,
  Platform,
  SeriesBookListing,
} from "#lib/ipc/bindings.ts";

export type SectionView = "covers" | "books";

export interface SectionScreen {
  readonly platform: Platform;
  readonly isWide: boolean;
}

type SectionViews = Readonly<Record<BookSection, SectionView>>;

const SECTION_VIEWS = {
  linux: { volumes: "covers", chapters: "books", specials: "covers" },
  macos: undefined,
  windows: undefined,
  ios: undefined,
  android: undefined,
} satisfies Record<Platform, SectionViews | undefined>;

function sectionViews(screen: SectionScreen): SectionViews | undefined {
  return screen.isWide ? SECTION_VIEWS[screen.platform] : undefined;
}

export function sectionTabs<Tab>(
  sections: readonly Tab[],
  screen: SectionScreen,
): readonly Tab[] {
  return sectionViews(screen) !== undefined && sections.length > 1
    ? sections
    : [];
}

export function shownSection(
  listing: SeriesBookListing,
  sections: readonly BookSection[],
): BookSection | undefined {
  const [only, ...others] = sections;
  return listing.section ?? (others.length === 0 ? only : undefined);
}

export function sectionView(
  listing: SeriesBookListing,
  sections: readonly BookSection[],
  screen: SectionScreen,
): SectionView {
  const section = shownSection(listing, sections);
  return section === undefined
    ? "books"
    : (sectionViews(screen)?.[section] ?? "books");
}

function chosenSection(
  listing: SeriesBookListing,
  tabs: readonly BookSection[],
): SeriesBookListing {
  const { shown, direction, section } = listing;
  const [first] = tabs;
  if (first === undefined) {
    return { shown, direction };
  }
  return {
    shown,
    direction,
    section: section != null && tabs.includes(section) ? section : first,
  };
}

export function sectionListing(
  listing: SeriesBookListing,
  sections: readonly BookSection[],
  screen: SectionScreen,
): SeriesBookListing {
  const chosen = chosenSection(listing, sectionTabs(sections, screen));
  return sectionView(chosen, sections, screen) === "covers"
    ? { ...chosen, shown: "all" }
    : chosen;
}
