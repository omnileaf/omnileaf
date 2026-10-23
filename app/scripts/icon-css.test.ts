import { expect, test } from "vitest";

import map from "../src/lib/icons/icon-map.json";
import { iconArtwork, renderIconFiles } from "./icon-css.ts";

const COMMITTED = import.meta.glob<string>(
  ["../src/lib/icons/icons.css", "../src/lib/icons/names.ts"],
  { query: "?raw", import: "default", eager: true },
);

const COMMITTED_ARTWORK = import.meta.glob("../src/lib/icons/**/*.svg");

const LIBRARY = {
  lucide: "library",
  framework7: "rectangle_stack",
  framework7Filled: "rectangle_stack_fill",
  material: "library_books",
  materialFilled: "library_books-fill",
};

const ERASER = { lucide: "eraser", material: "ink_eraser" };

test("draws today's icon by default and each platform's own artwork under it", () => {
  const css = renderIconFiles({ library: LIBRARY }).get("icons.css");

  expect(css).toContain(
    `[data-icon="library"] {
  --icon: url("./lucide/library.svg");
}
`,
  );
  expect(css).toContain(
    `:root[data-platform="ios"] [data-icon="library"] {
  --icon: url("./framework7/rectangle_stack.svg");
}
`,
  );
  expect(css).toContain(
    `:root[data-platform="android"] [data-icon="library"] {
  --icon: url("./material-symbols/library_books.svg");
}
`,
  );
});

test("swaps in each platform's filled artwork for a filled icon", () => {
  const css = renderIconFiles({ library: LIBRARY }).get("icons.css");

  expect(css).toContain(
    `:root[data-platform="ios"] [data-icon="library"][data-filled] {
  --icon: url("./framework7/rectangle_stack_fill.svg");
}
`,
  );
  expect(css).toContain(
    `:root[data-platform="android"] [data-icon="library"][data-filled] {
  --icon: url("./material-symbols/library_books-fill.svg");
}
`,
  );
});

test("keeps a lighter Lucide stroke on iOS where Framework7 has no artwork", () => {
  const css = renderIconFiles({ eraser: ERASER }).get("icons.css");

  expect(css).toContain(
    `:root[data-platform="ios"] [data-icon="eraser"] {
  --icon: url("./lucide/light/eraser.svg");
}
`,
  );
});

test("masks the current colour with the chosen artwork, in forced colours too", () => {
  const css = renderIconFiles({ eraser: ERASER }).get("icons.css");

  expect(css).toMatch(
    /^\[data-icon\] \{\n {2}display: inline-block;\n {2}flex-shrink: 0;\n {2}background-color: currentColor;\n {2}mask: var\(--icon\) center \/ contain no-repeat;\n {2}forced-color-adjust: none;\n\}\n/,
  );
});

test("names every icon in one type, in order", () => {
  const names = renderIconFiles({ library: LIBRARY, eraser: ERASER }).get(
    "names.ts",
  );

  expect(names).toBe(
    `export const ICON_NAMES = ["eraser", "library"] as const;

export type IconName = (typeof ICON_NAMES)[number];
`,
  );
});

test("lists the artwork each set has to ship, once each", () => {
  const artwork = iconArtwork({ library: LIBRARY, eraser: ERASER });

  expect(artwork).toEqual([
    { set: "framework7", name: "rectangle_stack" },
    { set: "framework7", name: "rectangle_stack_fill" },
    { set: "lucide", name: "eraser" },
    { set: "lucide", name: "library" },
    { set: "lucide/light", name: "eraser" },
    { set: "material-symbols", name: "ink_eraser" },
    { set: "material-symbols", name: "library_books" },
    { set: "material-symbols", name: "library_books-fill" },
  ]);
});

test("names an icon that has no Android artwork", () => {
  const withoutAndroid = { lucide: "eraser" };

  expect(() => renderIconFiles({ eraser: withoutAndroid })).toThrow(
    'Icon "eraser" needs a material name.',
  );
});

test("names a field the icon map does not know", () => {
  const misspelt = { ...ERASER, materialFill: "ink_eraser" };

  expect(() => renderIconFiles({ eraser: misspelt })).toThrow(
    'Icon "eraser" has an unknown field, materialFill.',
  );
});

test("matches the committed icon files, so a change to the map is regenerated", () => {
  const committed = Object.fromEntries(
    Object.entries(COMMITTED).map(([path, text]) => [
      path.replace("../src/lib/icons/", ""),
      text,
    ]),
  );

  const rendered = Object.fromEntries(renderIconFiles(map));

  expect(committed).toEqual(rendered);
});

test("ships every piece of artwork the icons point at, and nothing else", () => {
  const committed = Object.keys(COMMITTED_ARTWORK)
    .map((path) => path.replace("../src/lib/icons/", ""))
    .sort();

  const needed = iconArtwork(map)
    .map(({ set, name }) => `${set}/${name}.svg`)
    .sort();

  expect(committed).toEqual(needed);
});
