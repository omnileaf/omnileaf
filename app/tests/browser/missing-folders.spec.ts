import type { Locator, Page } from "@playwright/test";

import type {
  FolderProblem,
  MissingFolder,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);
const FOLDER_ID = "5a4d1e00-0000-4000-8002-000000000002";
const NAS_MANGA = { server: "nas", name: "nas/manga" };
const GVFS_MANGA = "/run/user/1000/gvfs/smb-share:server=nas,share=manga";

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

test.describe("with a folder that isn't there", () => {
  const folder = missingFolder({ kind: "missing" }, "Comics", "/media/Comics");
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
    { kind: "driveDisconnected" },
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
    { kind: "lostAccess" },
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
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove folder" })
      .click();

    await expect(notice(page, "Omnileaf can’t open Manga")).toHaveCount(0);
    expect(asked).toEqual([`remove ${FOLDER_ID}`]);
  });
});

test.describe("with a network share that wants a sign-in", () => {
  const folder = missingFolder(
    { kind: "needsSignIn", share: NAS_MANGA },
    "Manga",
    GVFS_MANGA,
  );
  test.use({ backend: backendMissing(folder) });
  test.beforeEach(() => {
    missing = [folder];
    asked = [];
  });

  test("asks to sign in to the share it names, and reads the share again", async ({
    page,
  }) => {
    await page.goto("/");
    const share = notice(page, "Sign in to see Manga");
    await expect(share).toContainText(
      "The network share nas/manga wants you to sign in again. Your reading progress is safe.",
    );

    await share.getByRole("button", { name: "Sign in" }).click();

    await expect.poll(() => asked).toEqual([`rescan ${FOLDER_ID}`]);
  });
});

test.describe("with a network share the system mounts", () => {
  const folder = missingFolder(
    { kind: "needsMounting", share: NAS_MANGA },
    "Manga",
    "/mnt/manga",
  );
  test.use({ backend: backendMissing(folder) });
  test.beforeEach(() => {
    missing = [folder];
    asked = [];
  });

  test("says to mount it again, then reads it again on Try again", async ({
    page,
  }) => {
    await page.goto("/");
    const share = notice(page, "Mount Manga’s share again");
    await expect(share).toContainText(
      "nas/manga is mounted by your system, so there’s no sign-in for Omnileaf to open. Mount it again, then choose Try again. Your reading progress is safe.",
    );

    await share.getByRole("button", { name: "Try again" }).click();

    await expect.poll(() => asked).toEqual([`rescan ${FOLDER_ID}`]);
  });

  test("offers no sign-in", async ({ page }) => {
    await page.goto("/");

    await expect(
      notice(page, "Mount Manga’s share again").getByRole("button", {
        name: "Sign in",
      }),
    ).toHaveCount(0);
  });
});

test.describe("with an Android folder on a network share", () => {
  const folder = missingFolder(
    { kind: "shareUnreachable", share: NAS_MANGA },
    "Manga",
    "nas › Manga",
  );
  test.use({
    backend: {
      ...backendMissing(folder),
      appInfo: () => fakeAppInfo("android"),
    },
  });
  test.beforeEach(() => {
    missing = [folder];
    asked = [];
  });

  test("says it's on the share, and offers to choose it again", async ({
    page,
  }) => {
    await page.goto("/");
    const share = notice(page, "Omnileaf can’t open Manga");
    await expect(share).toContainText(
      "It’s on the network share nas, which may want you to sign in again. Your reading progress is safe.",
    );

    await share.getByRole("button", { name: "Choose it again" }).click();

    await expect.poll(() => asked).toEqual([`relocate ${FOLDER_ID}`]);
  });

  test("unlinks it once confirmed", async ({ page }) => {
    await page.goto("/");

    await notice(page, "Omnileaf can’t open Manga")
      .getByRole("button", { name: "Unlink it" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove folder" })
      .click();

    await expect(notice(page, "Omnileaf can’t open Manga")).toHaveCount(0);
    expect(asked).toEqual([`remove ${FOLDER_ID}`]);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/");
      await expect(notice(page, "Omnileaf can’t open Manga")).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
