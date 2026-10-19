import { expect, test } from "vitest";

import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";

import {
  type AppleDevice,
  appleDeviceOf,
  folderLocation,
} from "./folder-location";

const CONTAINER =
  "/var/mobile/Containers/Data/Application/5D2E8F1A-3C4B-4A6E-B7D9-0E1F2A3B4C5D/Documents";
const IPHONE_WEB_VIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPAD_WEB_VIEW =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const IPAD_MOBILE_WEB_VIEW =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function shown(
  kind: LibraryFolder["kind"],
  platform: Platform,
  device: AppleDevice,
): string {
  return folderLocation({ kind, location: CONTAINER }, platform, device);
}

test("tells an iPhone from an iPad by the web view's user agent", () => {
  const devices = [IPHONE_WEB_VIEW, IPAD_WEB_VIEW, IPAD_MOBILE_WEB_VIEW].map(
    appleDeviceOf,
  );

  expect(devices).toEqual(["iphone", "ipad", "ipad"]);
});

test("names the iOS home folder where the Files app shows it on the device", () => {
  const locations = (["iphone", "ipad"] as const).map((device) =>
    shown("home", "ios", device),
  );

  expect(locations).toEqual([
    "On My iPhone › Omnileaf",
    "On My iPad › Omnileaf",
  ]);
});

function linkedOnIos(path: string, device: AppleDevice = "iphone"): string {
  return folderLocation({ kind: "linked", location: path }, "ios", device);
}

test("names a folder in iCloud Drive by the folders above it there", () => {
  const locations = [
    "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Comics",
    "/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Reading/Manga",
  ].map((path) => linkedOnIos(path));

  expect(locations).toEqual([
    "iCloud Drive › Comics",
    "iCloud Drive › Reading › Manga",
  ]);
});

test("names a folder kept on the device as On My iPhone or On My iPad", () => {
  const path =
    "/private/var/mobile/Containers/Shared/AppGroup/0A1B2C3D-4E5F-6071-8293-A4B5C6D7E8F9/File Provider Storage/Old comics";

  const locations = (["iphone", "ipad"] as const).map((device) =>
    linkedOnIos(path, device),
  );

  expect(locations).toEqual([
    "On My iPhone › Old comics",
    "On My iPad › Old comics",
  ]);
});

test("names a folder on a connected drive by the drive's name", () => {
  const location = linkedOnIos(
    "/private/var/mobile/Library/LiveFiles/com.apple.filesystems.userfsd/USB drive/Manga",
  );

  expect(location).toBe("USB drive › Manga");
});

test("names a folder from anywhere else by its own name, never its path", () => {
  const locations = [
    `${CONTAINER}/Comics`,
    "/private/var/mobile/Library/Mobile Documents/iCloud~com~example~reader/Documents/Comics",
  ].map((path) => linkedOnIos(path));

  expect(locations).toEqual(["Comics", "Comics"]);
});

test("shows the path of a folder linked anywhere but iOS", () => {
  const path =
    "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Comics";

  const locations = (["android", "macos", "windows", "linux"] as const).map(
    (platform) =>
      folderLocation({ kind: "linked", location: path }, platform, "iphone"),
  );

  expect(locations).toEqual(locations.map(() => path));
});

test("shows the path of the home folder everywhere but iOS", () => {
  const locations = (["android", "macos", "windows", "linux"] as const).map(
    (platform) => shown("home", platform, "ipad"),
  );

  expect(locations).toEqual(locations.map(() => CONTAINER));
});
