import type {
  BookSection,
  Platform,
  SeriesBookListing,
} from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";

import { sectionTabsLook } from "./section-tabs-look";

export type SectionView = "covers" | "books";

export type ListingChange = Partial<
  Pick<SeriesBookListing, "section" | "direction" | "shown">
>;

export interface SectionScreen {
  readonly platform: Platform;
  readonly width: WidthClass;
}

type SectionViews = Readonly<Record<BookSection, SectionView>>;

const COVERS_FOR_PICTURE_SECTIONS: SectionViews = {
  volumes: "covers",
  chapters: "books",
  specials: "covers",
};

const SECTION_VIEWS = {
  linux: COVERS_FOR_PICTURE_SECTIONS,
  macos: COVERS_FOR_PICTURE_SECTIONS,
  ios: COVERS_FOR_PICTURE_SECTIONS,
  windows: undefined,
  android: COVERS_FOR_PICTURE_SECTIONS,
} satisfies Record<Platform, SectionViews | undefined>;

const TABBED_AT_ANY_WIDTH: readonly Platform[] = ["ios", "android"];

function sectionViews(screen: SectionScreen): SectionViews | undefined {
  return screen.width === "expanded" ||
    TABBED_AT_ANY_WIDTH.includes(screen.platform)
    ? SECTION_VIEWS[screen.platform]
    : undefined;
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
  const isShownChosenAbove =
    sectionTabsLook(screen.platform, screen.width).controls === "heading";
  return sectionView(chosen, sections, screen) === "covers" &&
    !isShownChosenAbove
    ? { ...chosen, shown: "all" }
    : chosen;
}
