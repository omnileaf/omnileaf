import type { Locator, Page } from "@playwright/test";

import type {
  FolderProblem,
  MissingFolder,
  SignInOutcome,
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
  let signIn: SignInOutcome = "cancelled";
  test.use({
    backend: {
      ...backendMissing(folder),
      signInToLibraryFolder: (id) => {
        asked.push(`sign in ${id}`);
        if (signIn === "signedIn") {
          missing = [];
        }
        return signIn;
      },
    },
  });
  test.beforeEach(() => {
    missing = [folder];
    asked = [];
  });

  test("asks to sign in to the share it names", async ({ page }) => {
    await page.goto("/");

    await expect(notice(page, "Sign in to see Manga")).toContainText(
      "The network share nas/manga wants you to sign in again. Your reading progress is safe.",
    );
  });

  test("says the share is back once signed in, and checks it for changes", async ({
    page,
  }) => {
    signIn = "signedIn";
    await page.goto("/");

    await notice(page, "Sign in to see Manga")
      .getByRole("button", { name: "Sign in" })
      .click();

    await expect(notice(page, "Manga is back")).toContainText(
      "nas/manga is reachable again. Checking it for changes…",
    );
    await expect(notice(page, "Sign in to see Manga")).toHaveCount(0);
    expect(asked).toEqual([`sign in ${FOLDER_ID}`, `rescan ${FOLDER_ID}`]);
  });

  test("changes nothing when the sign-in is cancelled", async ({ page }) => {
    signIn = "cancelled";
    await page.goto("/");
    const share = notice(page, "Sign in to see Manga");

    await share.getByRole("button", { name: "Sign in" }).click();

    await expect.poll(() => asked).toEqual([`sign in ${FOLDER_ID}`]);
    await expect(share.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(notice(page, "Manga is back")).toHaveCount(0);
  });

  test("says it still couldn't sign in, and offers to sign in again", async ({
    page,
  }) => {
    signIn = "failed";
    await page.goto("/");

    await notice(page, "Sign in to see Manga")
      .getByRole("button", { name: "Sign in" })
      .click();
    const failed = notice(page, "Couldn’t sign in to Manga");
    await expect(failed).toContainText(
      "nas/manga still won’t let Omnileaf in. Check the name and password in the system’s sign-in, or that the server is on. Your reading progress is safe.",
    );
    await failed.getByRole("button", { name: "Sign in again" }).click();

    await expect
      .poll(() => asked)
      .toEqual([`sign in ${FOLDER_ID}`, `sign in ${FOLDER_ID}`]);
    await expect(notice(page, "Sign in to see Manga")).toHaveCount(0);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no accessibility violations once sign-in fails in the ${theme} theme`, async ({
      page,
    }) => {
      signIn = "failed";
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/");
      await notice(page, "Sign in to see Manga")
        .getByRole("button", { name: "Sign in" })
        .click();
      await expect(notice(page, "Couldn’t sign in to Manga")).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
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

function relocatedTo(
  folder: MissingFolder,
  outcome: "rescanned" | "unreachable",
): FakeBackend["relocateLibraryFolder"] {
  return (id) => {
    asked.push(`relocate ${id}`);
    if (outcome === "rescanned") {
      missing = [];
    }
    return {
      id,
      name: folder.folder.name,
      outcome:
        outcome === "rescanned"
          ? {
              kind: "rescanned",
              added: 0,
              updated: 0,
              moved: 0,
              removed: 0,
              unreadableBooks: 0,
              unsupportedBooks: 0,
              unreadableFolders: 0,
            }
          : { kind: "unreachable" },
    };
  };
}

test.describe("with an Android folder on a network share", () => {
  const folder = missingFolder(
    { kind: "shareUnreachable", share: NAS_MANGA },
    "Manga",
    "nas › Manga",
  );
  let relocated: "rescanned" | "unreachable" = "rescanned";
  test.use({
    backend: {
      ...backendMissing(folder),
      appInfo: () => fakeAppInfo("android"),
      relocateLibraryFolder: (id, onProgress) =>
        relocatedTo(folder, relocated)(id, onProgress),
    },
  });
  test.beforeEach(() => {
    missing = [folder];
    asked = [];
  });

  test("says it's on the share", async ({ page }) => {
    await page.goto("/");

    await expect(notice(page, "Omnileaf can’t open Manga")).toContainText(
      "It’s on the network share nas, which may want you to sign in again. Your reading progress is safe.",
    );
  });

  test("says what comes next before Android's folder picker opens", async ({
    page,
  }) => {
    await page.goto("/");

    await notice(page, "Omnileaf can’t open Manga")
      .getByRole("button", { name: "Choose it again" })
      .click();
    const sheet = page.getByRole("dialog", { name: "Choose Manga again" });

    await expect(sheet).toContainText("Android’s folder picker opens next.");
    await expect(sheet.getByRole("listitem")).toHaveText([
      "1 If your network app asks, sign in to nas there.",
      "2 Open nas, then the manga folder.",
      "3 Tap Use this folder.",
    ]);
    expect(asked).toEqual([]);
  });

  test("says the folder is back once chosen again", async ({ page }) => {
    relocated = "rescanned";
    await page.goto("/");
    await notice(page, "Omnileaf can’t open Manga")
      .getByRole("button", { name: "Choose it again" })
      .click();

    await page
      .getByRole("dialog", { name: "Choose Manga again" })
      .getByRole("button", { name: "Continue" })
      .click();

    await expect(notice(page, "Manga is back")).toContainText(
      "nas/manga is reachable again. Checking it for changes…",
    );
    await expect(notice(page, "Omnileaf can’t open Manga")).toHaveCount(0);
    expect(asked).toEqual([`relocate ${FOLDER_ID}`]);
  });

  test("says it still can't open the folder when the share stays unreachable", async ({
    page,
  }) => {
    relocated = "unreachable";
    await page.goto("/");
    await notice(page, "Omnileaf can’t open Manga")
      .getByRole("button", { name: "Choose it again" })
      .click();

    await page
      .getByRole("dialog", { name: "Choose Manga again" })
      .getByRole("button", { name: "Continue" })
      .click();

    const failing = notice(page, "Omnileaf still can’t open Manga");
    await expect(failing).toContainText(
      "nas/manga isn’t reachable. Check that you’re signed in to nas, and that it’s on. Your reading progress is safe.",
    );
    await expect(
      failing.getByRole("button", { name: "Choose it again" }),
    ).toBeVisible();
    await expect(
      failing.getByRole("button", { name: "Unlink it" }),
    ).toBeVisible();
  });

  test("leaves the folder as it is on Not now", async ({ page }) => {
    await page.goto("/");
    await notice(page, "Omnileaf can’t open Manga")
      .getByRole("button", { name: "Choose it again" })
      .click();

    await page
      .getByRole("dialog", { name: "Choose Manga again" })
      .getByRole("button", { name: "Not now" })
      .click();

    await expect(
      page.getByRole("dialog", { name: "Choose Manga again" }),
    ).toHaveCount(0);
    await expect(notice(page, "Omnileaf can’t open Manga")).toBeVisible();
    expect(asked).toEqual([]);
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

    test(`has no accessibility violations before the picker in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/");
      await notice(page, "Omnileaf can’t open Manga")
        .getByRole("button", { name: "Choose it again" })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Choose Manga again" }),
      ).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

test.describe("with an iOS folder on a network share", () => {
  const folder = missingFolder(
    { kind: "shareUnreachable", share: NAS_MANGA },
    "Manga",
    "nas › Manga",
  );
  test.use({
    backend: {
      ...backendMissing(folder),
      appInfo: () => fakeAppInfo("ios"),
    },
  });
  test.beforeEach(() => {
    missing = [folder];
    asked = [];
  });

  test("says the Files picker opens next, where the server signs in", async ({
    page,
  }) => {
    await page.goto("/");

    await notice(page, "Omnileaf can’t open Manga")
      .getByRole("button", { name: "Choose it again" })
      .click();
    const sheet = page.getByRole("dialog", { name: "Choose Manga again" });

    await expect(sheet).toContainText("The Files picker opens next.");
    await expect(sheet.getByRole("listitem")).toHaveText([
      "1 If Files asks, sign in to nas there.",
      "2 Open nas, then the manga folder.",
      "3 Tap Open.",
    ]);
  });
});
