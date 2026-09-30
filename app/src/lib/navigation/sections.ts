export type Section = "library" | "browse" | "history" | "settings";

export const SECTION_ROUTES = {
  library: "/",
  browse: "/browse",
  history: "/history",
  settings: "/settings",
} as const satisfies Record<Section, `/${string}`>;

const SECTIONS = Object.keys(SECTION_ROUTES).filter(
  (key): key is Section => key in SECTION_ROUTES,
);

export function sectionOf(pathname: string): Section {
  const [firstSegment = ""] = pathname.split("/").filter(Boolean);
  return (
    SECTIONS.find(
      (section) => SECTION_ROUTES[section] === `/${firstSegment}`,
    ) ?? "library"
  );
}
