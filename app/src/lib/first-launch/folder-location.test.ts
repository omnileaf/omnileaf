import { expect, test } from "vitest";

import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";

import { folderLocation } from "./folder-location";

const CONTAINER =
  "/var/mobile/Containers/Data/Application/5D2E8F1A-3C4B-4A6E-B7D9-0E1F2A3B4C5D/Documents";

function shown(kind: LibraryFolder["kind"], platform: Platform) {
  const location = folderLocation({ kind, location: CONTAINER }, platform);
  return { onPhones: location.onPhones(), fromMedium: location.fromMedium() };
}

test("names the iOS home folder where the Files app shows it", () => {
  const location = shown("home", "ios");

  expect(location).toEqual({
    onPhones: "On My iPhone › Omnileaf",
    fromMedium: "On My iPad › Omnileaf",
  });
});

test("shows the path of a folder linked on iOS", () => {
  const location = shown("linked", "ios");

  expect(location).toEqual({ onPhones: CONTAINER, fromMedium: CONTAINER });
});

test("shows the path of the home folder everywhere but iOS", () => {
  const locations = (["android", "macos", "windows", "linux"] as const).map(
    (platform) => shown("home", platform),
  );

  expect(locations).toEqual(
    locations.map(() => ({ onPhones: CONTAINER, fromMedium: CONTAINER })),
  );
});
