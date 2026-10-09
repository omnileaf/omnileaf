import type { FakeBackend } from "./fake-backend.ts";
import {
  expect,
  IPAD_USER_AGENT,
  IPHONE_USER_AGENT,
  onPlatform,
  test,
} from "./fixtures.ts";

type WireFolder = Awaited<
  ReturnType<FakeBackend["libraryFolders"]>
>["folders"][number];

const IOS_CONTAINER =
  "/var/mobile/Containers/Data/Application/5D2E8F1A-3C4B-4A6E-B7D9-0E1F2A3B4C5D/Documents";
const HOME: WireFolder = {
  id: "1",
  kind: "home",
  name: "Documents",
  location: IOS_CONTAINER,
  isAvailable: true,
};
const LINKED: WireFolder = {
  id: "2",
  kind: "linked",
  name: "Sample Comics From A Drive With A Long Name",
  location:
    "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Sample Comics From A Drive With A Long Name",
  isAvailable: true,
};

function withFolders(platform: "ios" | "android" | "linux"): {
  backend: FakeBackend;
} {
  const { backend } = onPlatform(platform);
  return {
    backend: {
      ...backend,
      libraryFolders: () => ({ folders: [HOME, LINKED], next: null }),
    },
  };
}

for (const [device, userAgent, location] of [
  ["an iPhone", IPHONE_USER_AGENT, "On My iPhone › Omnileaf"],
  ["an iPad", IPAD_USER_AGENT, "On My iPad › Omnileaf"],
] as const) {
  test.describe(`the home folder in Settings › Library on ${device}`, () => {
    test.use({ ...withFolders("ios"), userAgent });

    test("names where the Files app shows it on the device at any window width, without the app's private path", async ({
      page,
    }) => {
      await page.goto("/settings/library");

      await expect(page.getByText(location, { exact: true })).toBeVisible();
      await expect(page.getByText(IOS_CONTAINER)).toHaveCount(0);
    });
  });
}

test.describe("linked folders in Settings › Library on ios", () => {
  test.use(withFolders("ios"));

  test("keeps the path of a linked folder", async ({ page }) => {
    await page.goto("/settings/library");

    await expect(page.getByText(LINKED.location)).toBeVisible();
  });
});

for (const platform of ["android", "linux"] as const) {
  test.describe(`the home folder in Settings › Library on ${platform}`, () => {
    test.use(withFolders(platform));

    test("shows the home folder's path", async ({ page }) => {
      await page.goto("/settings/library");

      await expect(page.getByText(HOME.location)).toBeVisible();
    });
  });
}
