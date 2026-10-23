import { byCodePoint } from "../src/lib/licences/order.ts";

export interface IconArtwork {
  readonly set: string;
  readonly name: string;
}

interface IconEntry {
  readonly name: string;
  readonly lucide: string;
  readonly material: string;
  readonly materialFilled: string | undefined;
  readonly framework7: string | undefined;
  readonly framework7Filled: string | undefined;
}

interface PlatformArtwork {
  readonly platform: string;
  readonly plain: IconArtwork;
  readonly filled: IconArtwork | undefined;
}

const PRINT_WIDTH = 80;

const ICON_FIELDS: ReadonlySet<string> = new Set([
  "lucide",
  "material",
  "materialFilled",
  "framework7",
  "framework7Filled",
]);

const BASE_RULE = `[data-icon] {
  display: inline-block;
  flex-shrink: 0;
  background-color: currentColor;
  mask: var(--icon) center / contain no-repeat;
  forced-color-adjust: none;
}
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requireName(icon: string, value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Icon "${icon}" needs a ${field} name.`);
  }
  return value;
}

function parseMap(map: unknown): readonly IconEntry[] {
  if (!isRecord(map)) {
    throw new Error("The icon map must be an object of icons.");
  }
  return Object.entries(map)
    .sort(([a], [b]) => byCodePoint(a, b))
    .map(([name, raw]) => {
      if (!isRecord(raw)) {
        throw new Error(`Icon "${name}" must be an object.`);
      }
      const unknown = Object.keys(raw).find((key) => !ICON_FIELDS.has(key));
      if (unknown !== undefined) {
        throw new Error(`Icon "${name}" has an unknown field, ${unknown}.`);
      }
      return {
        name,
        lucide: requireName(name, raw.lucide, "lucide"),
        material: requireName(name, raw.material, "material"),
        materialFilled: optionalString(raw.materialFilled),
        framework7: optionalString(raw.framework7),
        framework7Filled: optionalString(raw.framework7Filled),
      };
    });
}

function artworkOf(
  set: string,
  name: string | undefined,
): IconArtwork | undefined {
  return name === undefined ? undefined : { set, name };
}

function platformArtwork(icon: IconEntry): readonly PlatformArtwork[] {
  return [
    {
      platform: "ios",
      plain: artworkOf("framework7", icon.framework7) ?? {
        set: "lucide/light",
        name: icon.lucide,
      },
      filled: artworkOf("framework7", icon.framework7Filled),
    },
    {
      platform: "android",
      plain: { set: "material-symbols", name: icon.material },
      filled: artworkOf("material-symbols", icon.materialFilled),
    },
  ];
}

function rule(selector: string, artwork: IconArtwork): string {
  return `${selector} {\n  --icon: url("./${artwork.set}/${artwork.name}.svg");\n}\n`;
}

function iconRules(icon: IconEntry): readonly string[] {
  const own = `[data-icon="${icon.name}"]`;
  return [
    rule(own, { set: "lucide", name: icon.lucide }),
    ...platformArtwork(icon).flatMap(({ platform, plain, filled }) => {
      const scoped = `:root[data-platform="${platform}"] ${own}`;
      return filled === undefined
        ? [rule(scoped, plain)]
        : [rule(scoped, plain), rule(`${scoped}[data-filled]`, filled)];
    }),
  ];
}

function namesFile(icons: readonly IconEntry[]): string {
  const quoted = icons.map((icon) => `"${icon.name}"`);
  const oneLine = `export const ICON_NAMES = [${quoted.join(", ")}] as const;`;
  const list =
    oneLine.length <= PRINT_WIDTH
      ? oneLine
      : `export const ICON_NAMES = [\n${quoted.map((name) => `  ${name},\n`).join("")}] as const;`;
  return `${list}\n\nexport type IconName = (typeof ICON_NAMES)[number];\n`;
}

export function renderIconFiles(map: unknown): ReadonlyMap<string, string> {
  const icons = parseMap(map);
  return new Map([
    ["icons.css", [BASE_RULE, ...icons.flatMap(iconRules)].join("\n")],
    ["names.ts", namesFile(icons)],
  ]);
}

export function iconArtwork(map: unknown): readonly IconArtwork[] {
  const all = parseMap(map).flatMap((icon) => [
    { set: "lucide", name: icon.lucide },
    ...platformArtwork(icon).flatMap(({ plain, filled }) =>
      filled === undefined ? [plain] : [plain, filled],
    ),
  ]);
  const unique = new Map(all.map((art) => [`${art.set}/${art.name}`, art]));
  return [...unique.values()].sort(
    (a, b) => byCodePoint(a.set, b.set) || byCodePoint(a.name, b.name),
  );
}
