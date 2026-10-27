import type { Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import type {
  ChosenHomeFolder,
  HomeArrival,
  HomeChoice,
  Platform,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
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

for (const userAgent of [IPHONE_USER_AGENT, IPAD_USER_AGENT]) {
  test.describe(`linked folders in Settings › Library on ios, as ${userAgent.includes("iPhone") ? "an iPhone" : "an iPad"}`, () => {
    test.use({ ...withFolders("ios"), userAgent });

    test("names a linked folder by where the Files app shows it, without its path", async ({
      page,
    }) => {
      await page.goto("/settings/library");

      await expect(
        page.getByText(`iCloud Drive › ${LINKED.name}`, { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(LINKED.location)).toHaveCount(0);
    });
  });
}

test.describe("linked folders in Settings › Library on linux", () => {
  test.use(withFolders("linux"));

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

const DESKTOP_HOME: WireFolder = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "/data/Omnileaf",
  isAvailable: true,
};
const CHOSEN_HOME = "/media/Sample Library";
const FOUND_CHOICE: HomeChoice = {
  kind: "found",
  library: {
    series: 212,
    books: 38,
    lastBackupAtMs: Date.UTC(2026, 9, 12, 9),
  },
};

class HomeChanges {
  chosen: (ChosenHomeFolder | null)[] = [];
  moves = 0;
  uses = 0;
  arrival: HomeArrival | null = null;
  answering: Promise<void> = Promise.resolve();

  reset(): void {
    this.chosen = [];
    this.moves = 0;
    this.uses = 0;
    this.arrival = null;
    this.answering = Promise.resolve();
  }

  holdAnswers(): () => void {
    let release = () => {};
    this.answering = new Promise((resolve) => {
      release = resolve;
    });
    return release;
  }

  choose(choice: HomeChoice): void {
    this.chosen.push({ location: CHOSEN_HOME, choice });
  }
}

const homeChanges = new HomeChanges();

function changingHomeOn(platform: Platform): FakeBackend {
  return {
    ...onPlatform(platform).backend,
    libraryFolders: () => ({ folders: [DESKTOP_HOME], next: null }),
    homeArrival: () => homeChanges.arrival,
    chooseHomeFolder: () => homeChanges.chosen.shift() ?? null,
    moveHomeFolder: () => {
      homeChanges.moves += 1;
      return null;
    },
    useFoundLibrary: async () => {
      homeChanges.uses += 1;
      await homeChanges.answering;
      return null;
    },
  };
}

function homeSection(page: Page) {
  return page.getByRole("region", { name: "Home folder" });
}

for (const [platform, change] of [
  ["linux", "Change"],
  ["windows", "Change"],
  ["macos", "Change…"],
] as const) {
  test.describe(`changing the home folder in Settings › Library on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use({ backend: changingHomeOn(platform) });

    test.beforeEach(() => {
      homeChanges.reset();
    });

    function changeIn(page: Page) {
      return homeSection(page).getByRole("button", {
        name: change,
        exact: true,
      });
    }

    test("sets Change before Rescan on the home folder", async ({ page }) => {
      await page.goto("/settings/library");
      await expect(changeIn(page)).toBeVisible();

      const names = await homeSection(page)
        .getByRole("button")
        .evaluateAll((buttons) =>
          buttons.map(
            (button) =>
              button.getAttribute("aria-label") ?? button.textContent.trim(),
          ),
        );

      expect(names).toEqual([change, "Rescan Omnileaf"]);
    });

    test("moves the library into an empty folder chosen with Change", async ({
      page,
    }) => {
      homeChanges.choose({ kind: "empty" });
      await page.goto("/settings/library");

      await changeIn(page).click();

      await expect.poll(() => homeChanges.moves).toBe(1);
    });

    test("shows the library found in the chosen folder, and uses it once asked", async ({
      page,
    }) => {
      homeChanges.choose(FOUND_CHOICE);
      await page.goto("/settings/library");
      await changeIn(page).click();
      const dialog = page.getByRole("alertdialog", {
        name: "A library is already here",
      });
      await expect(
        dialog.getByText(CHOSEN_HOME, { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText(
          "212 series · 38 books · Last backup October 12, 2026",
        ),
      ).toBeVisible();

      await dialog.getByRole("button", { name: "Use this library" }).click();

      await expect.poll(() => homeChanges.uses).toBe(1);
    });

    test("keeps the found library up while using it, focus kept on Use this library", async ({
      page,
    }) => {
      homeChanges.choose(FOUND_CHOICE);
      await page.goto("/settings/library");
      await changeIn(page).click();
      const dialog = page.getByRole("alertdialog", {
        name: "A library is already here",
      });
      const use = dialog.getByRole("button", { name: "Use this library" });
      const release = homeChanges.holdAnswers();

      await use.focus();
      await page.keyboard.press("Enter");
      await expect.poll(() => homeChanges.uses).toBe(1);

      await expect(dialog).toBeVisible();
      await expect(use).toBeFocused();
      await expect(use).toHaveAttribute("aria-disabled", "true");
      release();
    });

    test("goes back to Change when the found library is turned down", async ({
      page,
    }) => {
      homeChanges.choose(FOUND_CHOICE);
      await page.goto("/settings/library");
      await changeIn(page).click();
      const dialog = page.getByRole("alertdialog");

      await dialog.getByRole("button", { name: "Cancel" }).click();

      await expect(dialog).toHaveCount(0);
      await expect(changeIn(page)).toBeFocused();
      expect(homeChanges.uses).toBe(0);
    });

    test("warns that a folder inside the home folder won't do", async ({
      page,
    }) => {
      homeChanges.choose({ kind: "overlapsHome" });
      await page.goto("/settings/library");

      await changeIn(page).click();

      await expect(
        page.getByText("Couldn't move your library there", { exact: true }),
      ).toBeVisible();
      expect(homeChanges.moves).toBe(0);
    });

    test("says the library moved, after the relaunch", async ({ page }) => {
      homeChanges.arrival = "moved";

      await page.goto("/settings/library");

      await expect(
        page.getByText("Your library moved", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(`It's in ${DESKTOP_HOME.location} now.`),
      ).toBeVisible();
    });

    test("warns the library couldn't move, after the relaunch", async ({
      page,
    }) => {
      homeChanges.arrival = "moveFailed";

      await page.goto("/");

      await expect(
        page.getByText("Couldn't move your library", { exact: true }),
      ).toBeVisible();
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations with the found library shown, in the ${colorScheme} theme`, async ({
        page,
      }) => {
        homeChanges.choose(FOUND_CHOICE);
        await page.emulateMedia({ colorScheme });
        await page.goto("/settings/library");
        await changeIn(page).click();
        await expect(page.getByRole("alertdialog")).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  });
}
