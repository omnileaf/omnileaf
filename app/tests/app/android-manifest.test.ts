import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const MANIFEST = resolve(
  import.meta.dirname,
  "../../src-tauri/gen/android/app/src/main/AndroidManifest.xml",
);
const COMIC_EXTENSIONS = ["cbz", "cb7", "cbr"];
const COMIC_MIME_TYPES = [
  "application/vnd.comicbook+zip",
  "application/x-cbz",
  "application/x-cb7",
  "application/vnd.comicbook-rar",
  "application/x-cbr",
];

const GENERIC_RAR_MIME_TYPES = [
  "application/vnd.rar",
  "application/x-rar-compressed",
];

interface IntentFilter {
  action: string;
  mimeTypes: string[];
  pathPatterns: string[];
}

function attributeValues(filter: string, pattern: RegExp): string[] {
  return [...filter.matchAll(pattern)].map((found) => found[1] ?? "");
}

async function intentFilters(): Promise<IntentFilter[]> {
  const manifest = await readFile(MANIFEST, "utf8");
  return [...manifest.matchAll(/<intent-filter>([\s\S]*?)<\/intent-filter>/g)]
    .map((found) => found[1] ?? "")
    .map((filter) => ({
      action:
        attributeValues(filter, /<action android:name="([^"]*)"/g)[0] ?? "",
      mimeTypes: attributeValues(filter, /android:mimeType="([^"]*)"/g),
      pathPatterns: attributeValues(filter, /android:pathPattern="([^"]*)"/g),
    }));
}

test("offers every comic archive type when a file is opened or shared", async () => {
  const filters = await intentFilters();
  for (const action of [
    "android.intent.action.VIEW",
    "android.intent.action.SEND",
  ]) {
    const offered = filters
      .filter((filter) => filter.action === action)
      .flatMap((filter) => filter.mimeTypes);
    expect(offered).toEqual(expect.arrayContaining(COMIC_MIME_TYPES));
  }
});

test("matches comic archives by file name when a provider reports a generic type", async () => {
  const [byName] = (await intentFilters()).filter(
    (filter) => filter.pathPatterns.length > 0,
  );
  const expected = COMIC_EXTENSIONS.flatMap((extension) => [
    String.raw`.*\\.${extension}`,
    String.raw`.*\\..*\\.${extension}`,
    String.raw`.*\\..*\\..*\\.${extension}`,
  ]);
  expect(byName?.pathPatterns).toEqual(expected);
});

test("offers generic rar types where a provider or a share may report a comic archive that way", async () => {
  const filters = (await intentFilters()).filter(
    (filter) =>
      filter.action === "android.intent.action.SEND" ||
      filter.pathPatterns.length > 0,
  );
  expect(filters).toHaveLength(2);
  for (const filter of filters) {
    expect(filter.mimeTypes).toEqual(
      expect.arrayContaining(GENERIC_RAR_MIME_TYPES),
    );
  }
});
