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

async function readManifest(): Promise<string> {
  return readFile(MANIFEST, "utf8");
}

function attributeValues(filter: string, pattern: RegExp): string[] {
  return [...filter.matchAll(pattern)].map((found) => found[1] ?? "");
}

async function handledConfigChanges(): Promise<string[]> {
  const manifest = await readManifest();
  return (
    /android:configChanges="([^"]*)"/.exec(manifest)?.[1]?.split("|") ?? []
  );
}

async function intentFilters(): Promise<IntentFilter[]> {
  const manifest = await readManifest();
  return [...manifest.matchAll(/<intent-filter>([\s\S]*?)<\/intent-filter>/g)]
    .map((found) => found[1] ?? "")
    .map((filter) => ({
      action:
        attributeValues(filter, /<action android:name="([^"]*)"/g)[0] ?? "",
      mimeTypes: attributeValues(filter, /android:mimeType="([^"]*)"/g),
      pathPatterns: attributeValues(filter, /android:pathPattern="([^"]*)"/g),
    }));
}

async function elementAttributes(
  element: string,
  name: string,
): Promise<Record<string, string> | undefined> {
  const manifest = await readManifest();
  const tags = manifest.matchAll(new RegExp(`<${element}\\b([^>]*)>`, "g"));
  return [...tags]
    .map((tag) =>
      Object.fromEntries(
        [...(tag[1] ?? "").matchAll(/android:(\w+)="([^"]*)"/g)].map(
          (attribute) => [attribute[1] ?? "", attribute[2] ?? ""],
        ),
      ),
    )
    .find((attributes) => attributes["name"] === name);
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

test("keeps the daily update check scheduled after the phone restarts", async () => {
  expect(
    await elementAttributes(
      "uses-permission",
      "android.permission.RECEIVE_BOOT_COMPLETED",
    ),
  ).toBeDefined();
});

test("runs the daily update check as a job only the system can start", async () => {
  expect(await elementAttributes("service", ".UpdateCheckJob")).toEqual({
    name: ".UpdateCheckJob",
    permission: "android.permission.BIND_JOB_SERVICE",
    exported: "false",
  });
});

test("keeps the page open when Android's Bold text changes", async () => {
  const handled = await handledConfigChanges();

  expect(handled).toContain("fontWeightAdjustment");
});

test("keeps the page open when Android's font size or display size changes", async () => {
  const handled = await handledConfigChanges();

  expect(handled).toEqual(expect.arrayContaining(["fontScale", "density"]));
});
