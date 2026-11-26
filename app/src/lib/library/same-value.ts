function inOneOrder(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(inOneOrder);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([one], [other]) => one.localeCompare(other))
        .map(([key, field]) => [key, inOneOrder(field)]),
    );
  }
  return value;
}

/** Compares two values as the core sends them, plain data whose fields may come in any order. */
export function isSameValue(one: unknown, other: unknown): boolean {
  return JSON.stringify(inOneOrder(one)) === JSON.stringify(inOneOrder(other));
}
