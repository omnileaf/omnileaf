import type { Page } from "@playwright/test";

import type { UpdateStatus } from "../../src/lib/ipc/bindings.ts";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const SERIES = sampleSeries(6);
const VERSION = "0.2.0";
const HEADLINE = "Series pages show Volumes, Chapters and Specials as tabs";
const TITLE = `Omnileaf ${VERSION} is available`;
const TABLET = { width: 820, height: 1180 };

function newer(
  notice: "shown" | "snoozed" | "skipped",
  headline: string | null = HEADLINE,
): UpdateStatus {
  return {
    isAutomatic: true,
    release: {
      kind: "newer",
      version: VERSION,
      headline,
      releasePage: `https://github.com/omnileaf/omnileaf/releases/tag/v${VERSION}`,
      notice,
    },
  };
}

let status: UpdateStatus = newer("shown");
let asked: string[] = [];
let isBrowserMissing = false;

const BUILD_WITH_THE_CHECK: FakeBackend = {
  ...DEFAULT_BACKEND,
  appInfo: () => ({ ...fakeAppInfo("android"), checksForUpdates: true }),
  librarySeries: pagedSeries(() => SERIES),
  librarySeriesCount: () => SERIES.length,
  updateStatus: () => status,
  updateNotices: () => ({
    isOn: false,
    canShow: true,
    access: "allowed" as const,
  }),
  rememberUpdateNoticeWords: () => null,
  checkForUpdatesIfDue: () => ({ outcome: null, status }),
  snoozeUpdate: (version) => {
    asked.push(`snooze ${version}`);
    status = newer("snoozed");
    return status;
  },
  skipUpdate: (version) => {
    asked.push(`skip ${version}`);
    status = newer("skipped");
    return status;
  },
  openReleasePage: () => {
    asked.push("open release page");
    if (isBrowserMissing) {
      throw new CommandFailure({
        code: "browserUnavailable",
        message: "the browser could not be opened",
      });
    }
    return null;
  },
};

test.use({ backend: BUILD_WITH_THE_CHECK });

testOnlyInItsWebview("android");

test.beforeEach(() => {
  status = newer("shown");
  asked = [];
  isBrowserMissing = false;
});

function banner(page: Page) {
  return page.getByRole("status").filter({ hasText: TITLE });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
}

test.describe("the update banner in the Library", () => {
  test("names the version and the first line of its notes, with its actions", async ({
    page,
  }) => {
    await openLibrary(page);

    await expect(banner(page)).toContainText(HEADLINE);
    await expect(
      banner(page).getByRole("button", { name: "View release" }),
    ).toBeVisible();
    await expect(
      banner(page).getByRole("button", { name: "Not now" }),
    ).toBeVisible();
    await expect(
      banner(page).getByRole("button", { name: "More for this notice" }),
    ).toBeVisible();
  });

  test("leaves the line out when the release has no notes", async ({
    page,
  }) => {
    status = newer("shown", null);

    await openLibrary(page);

    await expect(banner(page)).toBeVisible();
    await expect(
      banner(page).locator("[data-slot=alert-description]"),
    ).toHaveCount(0);
  });

  test("opens the release page", async ({ page }) => {
    await openLibrary(page);

    await banner(page).getByRole("button", { name: "View release" }).click();

    await expect.poll(() => asked).toEqual(["open release page"]);
    await expect(banner(page)).toBeVisible();
  });

  test("says so when the browser could not open the release page", async ({
    page,
  }) => {
    isBrowserMissing = true;
    await openLibrary(page);

    await banner(page).getByRole("button", { name: "View release" }).click();

    await expect(page.getByRole("alert")).toContainText(
      "Couldn't open your browser. Try again.",
    );
  });

  test("puts the version off with Not now", async ({ page }) => {
    await openLibrary(page);

    await banner(page).getByRole("button", { name: "Not now" }).click();

    await expect(banner(page)).toHaveCount(0);
    expect(asked).toEqual([`snooze ${VERSION}`]);
  });

  test("skips the version from the notice's menu", async ({ page }) => {
    await openLibrary(page);

    await banner(page)
      .getByRole("button", { name: "More for this notice" })
      .click();
    await page.getByRole("menuitem", { name: "Skip this version" }).click();

    await expect(banner(page)).toHaveCount(0);
    expect(asked).toEqual([`skip ${VERSION}`]);
  });

  test("shows nothing for a version put off or skipped", async ({ page }) => {
    status = newer("snoozed");

    await openLibrary(page);

    await expect(banner(page)).toHaveCount(0);
  });

  test("steps aside while series are being selected", async ({ page }) => {
    await openLibrary(page);
    await expect(banner(page)).toBeVisible();

    await page.getByRole("button", { name: "More for the library" }).click();
    await page.getByRole("menuitem", { name: "Select" }).click();

    await expect(banner(page)).toHaveCount(0);
  });

  test("shows on a tablet too", async ({ page }) => {
    await page.setViewportSize(TABLET);

    await openLibrary(page);

    await expect(banner(page)).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme, menu open`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openLibrary(page);
      await banner(page)
        .getByRole("button", { name: "More for this notice" })
        .click();
      await expect(
        page.getByRole("menuitem", { name: "Skip this version" }),
      ).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

test.describe("the update banner on About", () => {
  test("comes first, above the app's name", async ({ page }) => {
    await page.goto("/settings/about");
    await expect(banner(page)).toBeVisible();

    const main = page.getByRole("main");
    const bannerTop = (await banner(page).boundingBox())?.y ?? Infinity;
    const nameTop =
      (await main.getByRole("heading", { name: "Omnileaf" }).boundingBox())
        ?.y ?? -Infinity;

    expect(bannerTop).toBeLessThan(nameTop);
  });
});

test.describe("a build without the check", () => {
  test.use({
    backend: { ...BUILD_WITH_THE_CHECK, appInfo: () => fakeAppInfo("android") },
  });

  test("shows no update banner", async ({ page }) => {
    await openLibrary(page);

    await expect(banner(page)).toHaveCount(0);
  });
});

test.describe("an empty library", () => {
  test.use({
    backend: {
      ...BUILD_WITH_THE_CHECK,
      librarySeries: () => ({ series: [], next: null }),
      librarySeriesCount: () => 0,
    },
  });

  test("shows no update banner", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();

    await expect(banner(page)).toHaveCount(0);
  });
});
