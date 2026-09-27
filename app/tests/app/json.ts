export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function listOf(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: readonly unknown[] = value;
  return items;
}
