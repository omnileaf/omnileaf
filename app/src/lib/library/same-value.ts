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

export function isSameValue(one: unknown, other: unknown): boolean {
  return JSON.stringify(inOneOrder(one)) === JSON.stringify(inOneOrder(other));
}
