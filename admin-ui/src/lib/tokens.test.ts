import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

const appCss = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const DARK_START = appCss.indexOf("@media (prefers-color-scheme: dark)");
const LIGHT = appCss.slice(0, DARK_START);
const DARK = appCss.slice(DARK_START);
const MIN_BOUNDARY_CONTRAST = 3;

function colourTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, name, hex] of css.matchAll(
    /--color-([a-z-]+):\s*(#[0-9a-f]{6});/g,
  )) {
    if (name !== undefined && hex !== undefined) {
      tokens.set(name, hex);
    }
  }
  return tokens;
}

function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const [light = 0, dark = 0] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

const SCHEMES = [
  ["light", colourTokens(LIGHT)],
  ["dark", new Map([...colourTokens(LIGHT), ...colourTokens(DARK)])],
] as const;
const SURFACES = ["card", "background", "well", "chip"] as const;

test.each(SCHEMES)(
  "reads every surface colour in the %s scheme",
  (_, tokens) => {
    for (const name of [...SURFACES, "field-edge"]) {
      expect(tokens.get(name), name).toMatch(/^#[0-9a-f]{6}$/);
    }
  },
);

test.each(SCHEMES)(
  "keeps the field edge at 3:1 against every surface in the %s scheme",
  (_, tokens) => {
    const edge = tokens.get("field-edge") ?? "";

    for (const surface of SURFACES) {
      const ratio = contrast(edge, tokens.get(surface) ?? "");
      expect(ratio, surface).toBeGreaterThanOrEqual(MIN_BOUNDARY_CONTRAST);
    }
  },
);

test("keeps the decorative border below the field edge", () => {
  for (const [, tokens] of SCHEMES) {
    const card = tokens.get("card") ?? "";
    const border = contrast(tokens.get("border") ?? "", card);
    const edge = contrast(tokens.get("field-edge") ?? "", card);

    expect(border).toBeLessThan(edge);
  }
});

test("switches the card shadow off in the dark scheme with its colour token", () => {
  expect(DARK).toMatch(/--card-shadow-color:\s*transparent;/);
  expect(LIGHT).not.toMatch(/--card-shadow-color:\s*transparent;/);
});

test("controls change from phone to desktop size at the tablet breakpoint", () => {
  expect(appCss).toContain("--breakpoint-tablet: 48rem;");
});
