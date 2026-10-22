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

test("names a kind the app does not know", () => {
  const unknownKind = { ...MOVE, kind: "weight" };

  expect(() => parse(unknownKind)).toThrow(
    'Token "move" has an unknown kind, weight.',
  );
});
