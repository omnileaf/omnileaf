import english from "../../messages/en.json" with { type: "json" };
import type { FakeBackend } from "./fake-backend.ts";
import {
  expect,
  IPAD_USER_AGENT,
  IPHONE_USER_AGENT,
  onPlatform,
  test,
  testOnlyInItsWebview,
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
const IPAD_WINDOWS = [
  { width: 840, height: 1180 },
  { width: 1024, height: 1366 },
  { width: 1180, height: 820 },
];

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

test.describe("Settings › Library's grouped ground on an iPad", () => {
  testOnlyInItsWebview("ios");
  test.use({ ...onPlatform("ios"), userAgent: IPAD_USER_AGENT });

  for (const window of IPAD_WINDOWS) {
    test(`stays inside the section's pane without scrolling the page sideways in a ${String(window.width)}px window`, async ({
      page,
    }) => {
      await page.setViewportSize(window);
      await page.goto("/settings/library");
      const ground = page.locator("[data-ground=grouped]");
      const sectionsColumn = page
        .getByRole("navigation", { name: english.settings_sections_label })
        .locator("..");
      await expect(ground).toBeVisible();

      const sidewaysScroll = await page
        .getByRole("main")
        .evaluate((main) => main.scrollWidth - main.clientWidth);
      const groundStart = await ground.evaluate(
        (element) => element.getBoundingClientRect().left,
      );
      const sectionsColumnEnd = await sectionsColumn.evaluate(
        (element) => element.getBoundingClientRect().right,
      );

      expect(sidewaysScroll).toBe(0);
      expect(groundStart).toBeGreaterThanOrEqual(sectionsColumnEnd);
    });
  }
});

for (const platform of ["android", "linux"] as const) {
  test.describe(`the home folder in Settings › Library on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use(withFolders(platform));

    test("shows the home folder's path", async ({ page }) => {
      await page.goto("/settings/library");

      await expect(page.getByText(HOME.location)).toBeVisible();
    });
  });
}
