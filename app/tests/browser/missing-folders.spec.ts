import type { Locator, Page } from "@playwright/test";

import type {
  FolderProblem,
  MissingFolder,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  settle,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);
const FOLDER_ID = "5a4d1e00-0000-4000-8002-000000000002";
const POINTER_ACTION_HEIGHT = 24;
const TOUCH_ACTION_HEIGHT = 48;
const ACTION_EDGE_SHARE = 45;

let missing: MissingFolder[] = [];
let asked: string[] = [];

function missingFolder(
  problem: FolderProblem,
  name: string,
  location: string,
): MissingFolder {
  return {
    folder: {
      id: FOLDER_ID,
      kind: "linked",
      name,
      location,
      isAvailable: false,
    },
    problem,
    hiddenSeries: 41,
    isShownAnyway: false,
  } as MissingFolder;
}

function backendMissing(folder: MissingFolder): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    missingLibraryFolders: () => missing,
    libraryHiddenSeriesCount: () =>
      missing.some((one) => !one.isShownAnyway) ? 41 : 0,
    showMissingLibraryFolder: (id, isShown) => {
      asked.push(`show ${id} ${String(isShown)}`);
      missing = missing.map((one) => ({ ...one, isShownAnyway: isShown }));
      return null;
    },
    relocateLibraryFolder: (id) => {
      asked.push(`relocate ${id}`);
      missing = [];
      return null;
    },
    rescanLibraryFolder: (id) => {
      asked.push(`rescan ${id}`);
      return {
        id,
        name: folder.folder.name,
        outcome: { kind: "unreachable" },
      };
    },
    removeLibraryFolder: (id) => {
      asked.push(`remove ${id}`);
      missing = [];
      return null;
    },
    libraryFolderBookCount: () => 41,
  };
}

function notice(page: Page, title: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) });
}

async function findTheFolder(page: Page): Promise<Locator> {
  await page.goto("/");
  const missingNotice = notice(page, "Comics isn’t there");
  await settle(missingNotice);
  return missingNotice.getByRole("button", { name: "Find the folder" });
}

function actionEdgeColour(page: Page): Promise<string> {
  return page.evaluate((share) => {
    const probe = document.createElement("span");
    probe.style.color = `color-mix(in oklab, var(--warning-foreground) ${String(share)}%, transparent)`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, ACTION_EDGE_SHARE);
}

test.describe("with a folder that isn't there", () => {
  const folder = missingFolder("missing", "Comics", "/media/Comics");
  test.use({ backend: backendMissing(folder) });
  test.beforeEach(() => {
    missing = [folder];
    asked = [];
  });

  test("says it isn't there, how many series it hides and that progress is safe", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(notice(page, "Comics isn’t there")).toContainText(
      "Its folder or drive may be disconnected. 41 series are hidden until it’s back. Your reading progress is safe.",
    );
    await expect(page.getByText("41 hidden")).toBeVisible();
  });

  test("shows the hidden series on asking, and the notice goes", async ({
    page,
  }) => {
    await page.goto("/");

    await notice(page, "Comics isn’t there")
      .getByRole("button", { name: "Show them anyway" })
      .click();

    await expect(notice(page, "Comics isn’t there")).toHaveCount(0);
    expect(asked).toEqual([`show ${FOLDER_ID} true`]);
  });

  test("finds the folder where it went", async ({ page }) => {
    await page.goto("/");

    await notice(page, "Comics isn’t there")
      .getByRole("button", { name: "Find the folder" })
      .click();

    await expect(notice(page, "Comics isn’t there")).toHaveCount(0);
    expect(asked).toEqual([`relocate ${FOLDER_ID}`]);
  });

  test("draws Find the folder 24px tall with 4px corners in 12px medium type on a desktop", async ({
    page,
  }) => {
    const find = await findTheFolder(page);

    const height = (await boxOf(find)).height;

    expect(height).toBe(POINTER_ACTION_HEIGHT);
    await expect(find).toHaveCSS("border-top-left-radius", "4px");
    await expect(find).toHaveCSS("font-size", "12px");
    await expect(find).toHaveCSS("font-weight", "500");
  });

  for (const theme of ["light", "dark"] as const) {
    test(`edges Find the folder in the warning ink at 45% in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      const find = await findTheFolder(page);

      const edge = await actionEdgeColour(page);

      await expect(find).toHaveCSS("border-top-color", edge);
    });
  }

  test.describe("on an Android phone", () => {
    testOnlyInItsWebview("android");
    test.use({
      backend: {
        ...backendMissing(folder),
        appInfo: onPlatform("android").backend.appInfo,
      },
    });

    test("draws Find the folder 48px tall in 14px semibold type", async ({
      page,
    }) => {
      test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
      const find = await findTheFolder(page);

      const height = (await boxOf(find)).height;

      expect(height).toBe(TOUCH_ACTION_HEIGHT);
      await expect(find).toHaveCSS("font-size", "14px");
      await expect(find).toHaveCSS("font-weight", "600");
    });
  });

  test.describe("on an iPhone", () => {
    testOnlyInItsWebview("ios");
    test.use({
      backend: {
        ...backendMissing(folder),
        appInfo: onPlatform("ios").backend.appInfo,
      },
    });

    test("draws Find the folder 48px tall in 14px medium type", async ({
      page,
    }) => {
      test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
      const find = await findTheFolder(page);

      const height = (await boxOf(find)).height;

      expect(height).toBe(TOUCH_ACTION_HEIGHT);
      await expect(find).toHaveCSS("font-size", "14px");
      await expect(find).toHaveCSS("font-weight", "500");
    });
  });

  test("stays dismissed while the app stays open", async ({ page }) => {
    await page.goto("/");
    await notice(page, "Comics isn’t there")
      .getByRole("button", { name: "Dismiss" })
      .click();

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "History" })
      .click();
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Library" })
      .click();

    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await expect(notice(page, "Comics isn’t there")).toHaveCount(0);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/");
      await expect(notice(page, "Comics isn’t there")).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

test.describe("with a drive that isn't connected", () => {
  const folder = missingFolder(
    "driveDisconnected",
    "Comics",
    "/Volumes/Archive/Comics",
  );
  test.use({ backend: backendMissing(folder) });
  test.beforeEach(() => {
    missing = [folder];
    asked = [];
  });

  test("says the drive isn't connected", async ({ page }) => {
    await page.goto("/");

    await expect(
      notice(page, "The drive with Comics isn’t connected"),
    ).toContainText(
      "Connect it to see its 41 series again. Your reading progress is safe.",
    );
  });
});

test.describe("with an Android folder Omnileaf lost access to", () => {
  const folder = missingFolder(
    "lostAccess",
    "Manga",
    "Internal storage › Manga",
  );
  test.use({ backend: backendMissing(folder) });
  test.beforeEach(() => {
    missing = [folder];
    asked = [];
  });

  test("offers to choose it again", async ({ page }) => {
    await page.goto("/");
    const lost = notice(page, "Omnileaf can’t open Manga");
    await expect(lost).toContainText(
      "Android took away access to this folder. Your reading progress is safe.",
    );

    await lost.getByRole("button", { name: "Choose it again" }).click();

    expect(asked).toEqual([`relocate ${FOLDER_ID}`]);
  });

  test("unlinks it once confirmed", async ({ page }) => {
    await page.goto("/");

    await notice(page, "Omnileaf can’t open Manga")
      .getByRole("button", { name: "Unlink it" })
      .click();
    const question = page.getByRole("alertdialog");
    await settle(question);
    await question.getByRole("button", { name: "Remove folder" }).click();

    await expect(notice(page, "Omnileaf can’t open Manga")).toHaveCount(0);
    expect(asked).toEqual([`remove ${FOLDER_ID}`]);
  });
});

test.describe("with a network share that wants a sign-in", () => {
  const folder = missingFolder("needsSignIn", "Manga", "nas/manga");
  test.use({ backend: backendMissing(folder) });
  test.beforeEach(() => {
    missing = [folder];
    asked = [];
  });

  test("asks to sign in, and reads the share again", async ({ page }) => {
    await page.goto("/");
    const share = notice(page, "Sign in to see Manga");
    await expect(share).toContainText(
      "The network share nas/manga wants you to sign in again. Your reading progress is safe.",
    );

    await share.getByRole("button", { name: "Sign in" }).click();

    await expect.poll(() => asked).toEqual([`rescan ${FOLDER_ID}`]);
  });
});
