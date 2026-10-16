export function resolvedColour(
  value: string,
  property: "color" | "backgroundColor" | "outlineColor",
): string {
  const probe = document.createElement("span");
  probe.style[property] = value.startsWith("--") ? `var(${value})` : value;
  document.body.append(probe);
  const colour = getComputedStyle(probe)[property];
  probe.remove();
  return colour;
}
