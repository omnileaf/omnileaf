export function propsWithoutStyle(props: unknown): Record<string, unknown> {
  if (typeof props !== "object" || props === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => key !== "style"),
  );
}
