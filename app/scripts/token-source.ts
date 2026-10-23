import type { Platform } from "../src/lib/ipc/bindings.ts";

const KNOWN_PLATFORMS = {
  android: true,
  ios: true,
  linux: true,
  macos: true,
  windows: true,
} satisfies Record<Platform, true>;

const KINDS = ["color", "radius", "spacing", "duration", "ease"] as const;

export type Kind = (typeof KINDS)[number];

export type PlatformValue =
  | { readonly themed: false; readonly value: string }
  | { readonly themed: true; readonly light: string; readonly dark: string };

export interface Token {
  readonly name: string;
  readonly kind: Kind;
  readonly defaultValue: string;
  readonly platforms: ReadonlyMap<Platform, PlatformValue>;
  readonly reducedMotion: string | undefined;
}

export interface TokenSource {
  readonly tokens: readonly Token[];
  readonly platforms: readonly Platform[];
}

const VALUE_KEY = /^(?<platform>.+?)(?:-(?<theme>light|dark))?$/;

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

function collectByPlatform(
  name: string,
  values: Record<string, unknown>,
): Map<Platform, ThemedValues> {
  const byPlatform = new Map<Platform, ThemedValues>();
  for (const [key, raw] of Object.entries(values)) {
    if (key === "default") {
      continue;
    }
    const { platform = key, theme } = VALUE_KEY.exec(key)?.groups ?? {};
    if (!isKnownPlatform(platform)) {
      throw new Error(`Token "${name}" names an unknown platform, ${key}.`);
    }
    const entry = byPlatform.get(platform) ?? {};
    const value = requireString(raw, `Token "${name}" value ${key}`);
    if (theme === "light" || theme === "dark") {
      entry[theme] = value;
    } else {
      entry.plain = value;
    }
    byPlatform.set(platform, entry);
  }
  return byPlatform;
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
  const platforms = new Map(
    [...collectByPlatform(name, raw.value)].map(([platform, values]) => [
      platform,
      toPlatformValue(name, platform, values),
    ]),
  );
  const reducedMotion =
    raw.reducedMotion === undefined
      ? undefined
      : requireString(raw.reducedMotion, `Token "${name}" reducedMotion`);
  return { name, kind, defaultValue, platforms, reducedMotion };
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

export function parseTokenSource(source: unknown): TokenSource {
  if (!isRecord(source) || !Array.isArray(source.tokens)) {
    throw new Error("The token source needs a tokens array.");
  }
  const tokens = source.tokens.map(parseToken);
  const platforms = platformsOf(tokens);
  requireEveryPlatform(tokens, platforms);
  return { tokens, platforms };
}
