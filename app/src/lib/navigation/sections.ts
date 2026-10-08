import type { PageRouteId } from "$app/types";

export type Section = "library" | "browse" | "history" | "settings";

export const SECTION_PATHNAMES = {
  library: "/",
  browse: "/browse",
  history: "/history",
  settings: "/settings",
} as const satisfies Record<Section, `/${string}`>;

export const SECTION_ROUTE_IDS = {
  library: "/(app)",
  browse: "/(app)/browse",
  history: "/(app)/history",
  settings: "/(app)/settings",
} as const satisfies Record<Section, PageRouteId>;

const SECTIONS = Object.keys(SECTION_PATHNAMES).filter(
  (key): key is Section => key in SECTION_PATHNAMES,
);

export function sectionOf(pathname: string): Section {
  const [firstSegment = ""] = pathname.split("/").filter(Boolean);
  return (
    SECTIONS.find(
      (section) => SECTION_PATHNAMES[section] === `/${firstSegment}`,
    ) ?? "library"
  );
}
