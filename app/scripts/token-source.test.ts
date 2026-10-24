import { expect, test } from "vitest";

import { parseTokenSource } from "./token-source.ts";

const ACCENT = {
  name: "accent",
  kind: "color",
  value: {
    default: "var(--primary)",
    "ios-light": "#2f7d4f",
    "ios-dark": "#5cbf86",
    "android-light": "#2d6a46",
    "android-dark": "#93d5a7",
  },
};

const MOVE = {
  name: "move",
  kind: "duration",
  value: { default: "300ms", ios: "400ms", android: "450ms" },
  reducedMotion: "0ms",
};

const FADE = {
  name: "fade",
  kind: "duration",
  value: { default: "150ms", ios: "150ms", android: "150ms" },
};

function parse(...entries: readonly object[]) {
  return parseTokenSource({ tokens: entries });
}

test("reads one value or a light and a dark value for each platform, and lists the platforms in order", () => {
  const source = parse(ACCENT, MOVE);

  expect(source.platforms).toEqual(["android", "ios"]);
  expect(source.tokens.map((token) => token.platforms.get("ios"))).toEqual([
    { themed: true, light: "#2f7d4f", dark: "#5cbf86" },
    { themed: false, value: "400ms" },
  ]);
  expect(source.tokens[1]?.reducedMotion).toBe("0ms");
});

test("names the token and the platform when a value is missing", () => {
  const withoutAndroid = {
    ...FADE,
    value: { default: "150ms", ios: "150ms" },
  };

  expect(() => parse(MOVE, withoutAndroid)).toThrow(
    'Token "fade" has no value for android, which other tokens have.',
  );
});

test("names a platform drawn in one theme only", () => {
  const lightOnly = {
    ...ACCENT,
    value: { default: "var(--primary)", "ios-light": "#2f7d4f" },
  };

  expect(() => parse(lightOnly)).toThrow(
    'Token "accent" needs both ios-light and ios-dark.',
  );
});

test("names a platform given one value and per-theme values at once", () => {
  const mixed = {
    ...ACCENT,
    value: { ...ACCENT.value, ios: "#2f7d4f" },
  };

  expect(() => parse(mixed)).toThrow(
    'Token "accent" gives ios one value and per-theme values; give one or the other.',
  );
});

test("reads a contrast or transparency value for a platform in each theme", () => {
  const sharper = {
    ...ACCENT,
    value: {
      ...ACCENT.value,
      "ios-light-contrast-more": "#245a40",
      "ios-dark-contrast-more": "#a8e0bf",
    },
  };

  const [token] = parse(sharper).tokens;

  expect(token?.modes).toEqual([
    {
      platform: "ios",
      mode: "contrast-more",
      light: "#245a40",
      dark: "#a8e0bf",
    },
  ]);
  expect(token?.platforms.get("ios")).toEqual({
    themed: true,
    light: "#2f7d4f",
    dark: "#5cbf86",
  });
});

test("names a contrast value given for one theme only", () => {
  const lightOnly = {
    ...ACCENT,
    value: { ...ACCENT.value, "ios-light-contrast-more": "#245a40" },
  };

  expect(() => parse(lightOnly)).toThrow(
    'Token "accent" needs both ios-light-contrast-more and ios-dark-contrast-more.',
  );
});

test("names a contrast value given without a theme", () => {
  const unthemed = {
    ...ACCENT,
    value: { ...ACCENT.value, "android-contrast-high": "#002a18" },
  };

  expect(() => parse(unthemed)).toThrow(
    'Token "accent" needs both android-light-contrast-high and android-dark-contrast-high.',
  );
});

test("names a contrast value for a platform with no value of its own to change", () => {
  const orphan = {
    ...MOVE,
    value: {
      default: "300ms",
      "ios-light-transparency-reduced": "0ms",
      "ios-dark-transparency-reduced": "0ms",
    },
  };

  expect(() => parse(orphan)).toThrow(
    'Token "move" changes ios under transparency-reduced but has no ios value.',
  );
});

test("names a contrast setting drawn on a platform that does not have it", () => {
  const borrowed = {
    ...ACCENT,
    value: {
      ...ACCENT.value,
      "android-light-contrast-more": "#245a40",
      "android-dark-contrast-more": "#a8e0bf",
    },
  };

  expect(() => parse(borrowed)).toThrow(
    'Token "accent" sets contrast-more on android, but only ios has contrast-more.',
  );
});

test("names an android contrast setting drawn on ios", () => {
  const borrowed = {
    ...ACCENT,
    value: {
      ...ACCENT.value,
      "ios-light-contrast-high": "#002a18",
      "ios-dark-contrast-high": "#c2f0d2",
    },
  };

  expect(() => parse(borrowed)).toThrow(
    'Token "accent" sets contrast-high on ios, but only android has contrast-high.',
  );
});

test("names a reduced transparency value drawn on android", () => {
  const borrowed = {
    ...ACCENT,
    value: {
      ...ACCENT.value,
      "android-light-transparency-reduced": "#f7f7f7",
      "android-dark-transparency-reduced": "#1c1c1e",
    },
  };

  expect(() => parse(borrowed)).toThrow(
    'Token "accent" sets transparency-reduced on android, but only ios has transparency-reduced.',
  );
});

test("names a token stilled under reduced motion that also changes under a setting, since the setting would outrank reduced motion", () => {
  const both = {
    ...MOVE,
    value: {
      ...MOVE.value,
      "ios-light-transparency-reduced": "150ms",
      "ios-dark-transparency-reduced": "150ms",
    },
  };

  expect(() => parse(both)).toThrow(
    'Token "move" sets reducedMotion and changes under transparency-reduced; reduced motion must win, so give one or the other.',
  );
});

test("names a token without a default", () => {
  const withoutDefault = { ...MOVE, value: { ios: "400ms" } };

  expect(() => parse(withoutDefault)).toThrow(
    'Token "move" needs a default, today\'s value.',
  );
});

test("names a platform the app does not know", () => {
  const misspelt = { ...MOVE, value: { default: "300ms", andriod: "450ms" } };

  expect(() => parse(misspelt)).toThrow(
    'Token "move" names an unknown platform, andriod.',
  );
});

test("names a misspelt setting as an unknown platform", () => {
  const misspelt = {
    ...ACCENT,
    value: { ...ACCENT.value, "ios-light-contrast-mor": "#245a40" },
  };

  expect(() => parse(misspelt)).toThrow(
    'Token "accent" names an unknown platform, ios-light-contrast-mor.',
  );
});

test("names a kind the app does not know", () => {
  const unknownKind = { ...MOVE, kind: "volume" };

  expect(() => parse(unknownKind)).toThrow(
    'Token "move" has an unknown kind, volume.',
  );
});

test("names a colour and a text size that share a name, since Tailwind reads both as text-", () => {
  const colour = { name: "label", kind: "color", value: { default: "red" } };
  const size = { name: "label", kind: "text", value: { default: "1rem" } };

  expect(() => parse(colour, size)).toThrow(
    'Token "label" is both a colour and a text size; give one another name.',
  );
});

test("names a colour and a shadow that share a name, since Tailwind reads both as shadow-", () => {
  const colour = { name: "lift", kind: "color", value: { default: "red" } };
  const shadow = { name: "lift", kind: "shadow", value: { default: "none" } };

  expect(() => parse(colour, shadow)).toThrow(
    'Token "lift" is both a colour and a shadow; give one another name.',
  );
});
