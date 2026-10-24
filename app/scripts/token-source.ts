import type { Platform } from "../src/lib/ipc/bindings.ts";

const KNOWN_PLATFORMS = {
  android: true,
  ios: true,
  linux: true,
  macos: true,
  windows: true,
} satisfies Record<Platform, true>;

const KINDS = [
  "color",
  "radius",
  "spacing",
  "duration",
  "ease",
  "text",
  "leading",
  "weight",
  "tracking",
  "shadow",
] as const;

export type Kind = (typeof KINDS)[number];

export type PlatformValue =
  | { readonly themed: false; readonly value: string }
  | { readonly themed: true; readonly light: string; readonly dark: string };

export const MODES = [
  "contrast-medium",
  "contrast-high",
  "contrast-more",
  "transparency-reduced",
] as const;

export type Mode = (typeof MODES)[number];

const MODE_PLATFORM = {
  "contrast-medium": "android",
  "contrast-high": "android",
  "contrast-more": "ios",
  "transparency-reduced": "ios",
} satisfies Record<Mode, Platform>;

export interface ModeValue {
  readonly platform: Platform;
  readonly mode: Mode;
  readonly light: string;
  readonly dark: string;
}

export interface Token {
  readonly name: string;
  readonly kind: Kind;
  readonly defaultValue: string;
  readonly platforms: ReadonlyMap<Platform, PlatformValue>;
  readonly reducedMotion: string | undefined;
  readonly modes: readonly ModeValue[];
}

export interface TokenSource {
  readonly tokens: readonly Token[];
  readonly platforms: readonly Platform[];
}

const VALUE_KEY = new RegExp(
  `^(?<platform>[a-z]+?)(?:-(?<theme>light|dark))?(?:-(?<mode>${MODES.join("|")}))?$`,
);

interface ThemedValues {
  plain?: string;
  light?: string;
  dark?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownPlatform(name: string): name is Platform {
  return Object.hasOwn(KNOWN_PLATFORMS, name);
}

function isKind(name: string): name is Kind {
  return KINDS.some((kind) => kind === name);
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== "string") {
    throw new Error(`${what} must be a string.`);
  }
  return value;
}

function isMode(name: string | undefined): name is Mode {
  return MODES.some((mode) => mode === name);
}

interface ModeValues extends ThemedValues {
  readonly platform: Platform;
  readonly mode: Mode;
}

interface CollectedValues {
  readonly byPlatform: Map<Platform, ThemedValues>;
  readonly byMode: Map<string, ModeValues>;
}

function collectValues(
  name: string,
  values: Record<string, unknown>,
): CollectedValues {
  const byPlatform = new Map<Platform, ThemedValues>();
  const byMode = new Map<string, ModeValues>();
  for (const [key, raw] of Object.entries(values)) {
    if (key === "default") {
      continue;
    }
    const { platform = key, theme, mode } = VALUE_KEY.exec(key)?.groups ?? {};
    if (!isKnownPlatform(platform)) {
      throw new Error(`Token "${name}" names an unknown platform, ${key}.`);
    }
    const value = requireString(raw, `Token "${name}" value ${key}`);
    const entry = isMode(mode)
      ? upsert(byMode, `${platform}-${mode}`, { platform, mode })
      : upsert(byPlatform, platform, {});
    if (theme === "light" || theme === "dark") {
      entry[theme] = value;
    } else {
      entry.plain = value;
    }
  }
  return { byPlatform, byMode };
}

function upsert<Key, Entry>(
  map: Map<Key, Entry>,
  key: Key,
  fresh: Entry,
): Entry {
  const entry = map.get(key) ?? fresh;
  map.set(key, entry);
  return entry;
}

function toModeValue(
  name: string,
  { platform, mode, plain, light, dark }: ModeValues,
  platforms: ReadonlyMap<Platform, PlatformValue>,
): ModeValue {
  if (platform !== MODE_PLATFORM[mode]) {
    throw new Error(
      `Token "${name}" sets ${mode} on ${platform}, but only ${MODE_PLATFORM[mode]} has ${mode}.`,
    );
  }
  if (plain !== undefined || light === undefined || dark === undefined) {
    throw new Error(
      `Token "${name}" needs both ${platform}-light-${mode} and ${platform}-dark-${mode}.`,
    );
  }
  if (!platforms.has(platform)) {
    throw new Error(
      `Token "${name}" changes ${platform} under ${mode} but has no ${platform} value.`,
    );
  }
  return { platform, mode, light, dark };
}

function toPlatformValue(
  name: string,
  platform: Platform,
  { plain, light, dark }: ThemedValues,
): PlatformValue {
  if (plain !== undefined) {
    if (light !== undefined || dark !== undefined) {
      throw new Error(
        `Token "${name}" gives ${platform} one value and per-theme values; give one or the other.`,
      );
    }
    return { themed: false, value: plain };
  }
  if (light === undefined || dark === undefined) {
    throw new Error(
      `Token "${name}" needs both ${platform}-light and ${platform}-dark.`,
    );
  }
  return { themed: true, light, dark };
}

function parseToken(raw: unknown): Token {
  if (!isRecord(raw)) {
    throw new Error("Each token must be an object.");
  }
  const name = requireString(raw.name, "A token's name");
  const kind = requireString(raw.kind, `Token "${name}" kind`);
  if (!isKind(kind)) {
    throw new Error(`Token "${name}" has an unknown kind, ${kind}.`);
  }
  if (!isRecord(raw.value)) {
    throw new Error(`Token "${name}" needs a value object.`);
  }
  if (raw.value.default === undefined) {
    throw new Error(`Token "${name}" needs a default, today's value.`);
  }
  const defaultValue = requireString(
    raw.value.default,
    `Token "${name}" default`,
  );
  const { byPlatform, byMode } = collectValues(name, raw.value);
  const platforms = new Map(
    [...byPlatform].map(([platform, values]) => [
      platform,
      toPlatformValue(name, platform, values),
    ]),
  );
  const modes = [...byMode.values()].map((values) =>
    toModeValue(name, values, platforms),
  );
  const reducedMotion =
    raw.reducedMotion === undefined
      ? undefined
      : requireString(raw.reducedMotion, `Token "${name}" reducedMotion`);
  const [outranking] = modes;
  if (reducedMotion !== undefined && outranking !== undefined) {
    throw new Error(
      `Token "${name}" sets reducedMotion and changes under ${outranking.mode}; reduced motion must win, so give one or the other.`,
    );
  }
  return { name, kind, defaultValue, platforms, reducedMotion, modes };
}

function platformsOf(tokens: readonly Token[]): readonly Platform[] {
  return [
    ...new Set(tokens.flatMap((token) => [...token.platforms.keys()])),
  ].sort();
}

function requireEveryPlatform(
  tokens: readonly Token[],
  platforms: readonly Platform[],
): void {
  for (const token of tokens) {
    const missing = platforms.find(
      (platform) => !token.platforms.has(platform),
    );
    if (missing !== undefined) {
      throw new Error(
        `Token "${token.name}" has no value for ${missing}, which other tokens have.`,
      );
    }
  }
}

const COLOUR_CLASHES = { text: "a text size", shadow: "a shadow" } as const;

function rejectColourClashes(tokens: readonly Token[]): void {
  for (const [kind, description] of Object.entries(COLOUR_CLASHES)) {
    const names = new Set(
      tokens.filter((token) => token.kind === kind).map((token) => token.name),
    );
    const clash = tokens.find(
      (token) => token.kind === "color" && names.has(token.name),
    );
    if (clash !== undefined) {
      throw new Error(
        `Token "${clash.name}" is both a colour and ${description}; give one another name.`,
      );
    }
  }
}

export function parseTokenSource(source: unknown): TokenSource {
  if (!isRecord(source) || !Array.isArray(source.tokens)) {
    throw new Error("The token source needs a tokens array.");
  }
  const tokens = source.tokens.map(parseToken);
  const platforms = platformsOf(tokens);
  requireEveryPlatform(tokens, platforms);
  rejectColourClashes(tokens);
  return { tokens, platforms };
}
