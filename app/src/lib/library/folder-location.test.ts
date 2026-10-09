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

test("shows the path of a folder linked on iOS", () => {
  const location = shown("linked", "ios", "iphone");

  expect(location).toBe(CONTAINER);
});

test("shows the path of the home folder everywhere but iOS", () => {
  const locations = (["android", "macos", "windows", "linux"] as const).map(
    (platform) => shown("home", platform, "ipad"),
  );

  expect(locations).toEqual(locations.map(() => CONTAINER));
});
