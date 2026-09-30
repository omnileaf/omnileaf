export type Section = "library" | "browse" | "history" | "settings";

const NESTED_SECTIONS: readonly Exclude<Section, "library">[] = [
  "browse",
  "history",
  "settings",
];

export function sectionOf(pathname: string): Section {
  const [firstSegment] = pathname.split("/").filter(Boolean);
  return (
    NESTED_SECTIONS.find((section) => section === firstSegment) ?? "library"
  );
}
