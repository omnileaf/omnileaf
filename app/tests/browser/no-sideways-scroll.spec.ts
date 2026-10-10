import type { Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  APP_PAGES,
  expect,
  onPlatform,
  sidewaysOverflow,
  test,
} from "./fixtures.ts";

const SIMULATOR_HOME =
  "/Users/reader/Library/Developer/CoreSimulator/Devices/2A6F0C3E-8B1D-4E7A-9C52-1F3B7D9E4A60/data/Containers/Data/Application/5D2E8F1A-3C4B-4A6E-B7D9-0E1F2A3B4C5D/Documents";
const LONG_FOLDER_NAME =
  "Comics-and-manga-gathered-over-many-years-from-every-shelf-in-the-house";

const LANGUAGES = { en: english, "en-XA": pseudo } as const;
const PLATFORMS = ["ios", "android", "linux"] as const;
const FIRST_LAUNCH_STEPS = ["welcome", "home", "link", "choices", "ready"];

type StepButtonNames = Pick<
  typeof english,
  "first_launch_get_started" | "first_launch_continue"
>;

function withLongFolders(
  platform: (typeof PLATFORMS)[number],
  isFirstLaunch: boolean,
): FakeBackend {
  return {
    ...onPlatform(platform).backend,
    firstLaunchFinished: () => !isFirstLaunch,
    libraryFolders: () => ({
      folders: [
        {
          id: "1",
          kind: "home",
          name: "Documents",
          location: SIMULATOR_HOME,
          isAvailable: true,
        },
        {
          id: "2",
          kind: "linked",
          name: LONG_FOLDER_NAME,
          location: `${SIMULATOR_HOME}/${LONG_FOLDER_NAME}`,
          isAvailable: true,
        },
      ],
      next: null,
    }),
  };
}

function withAddFolder(
  platform: (typeof PLATFORMS)[number],
  addLibraryFolder: FakeBackend["addLibraryFolder"],
): FakeBackend {
  return { ...onPlatform(platform).backend, addLibraryFolder };
}

/** Leaves each step by the name its button has in `messages`, since the names are translated. */
async function goToStep(
  page: Page,
  messages: StepButtonNames,
  step: number,
): Promise<void> {
  const leaveWith = [
    messages.first_launch_get_started,
    messages.first_launch_continue,
    messages.first_launch_continue,
    messages.first_launch_continue,
  ];
  await page.goto("/first-launch");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const name of leaveWith.slice(0, step)) {
    await page
      .getByRole("main")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  }
}

for (const platform of PLATFORMS) {
  for (const [language, messages] of Object.entries(LANGUAGES)) {
    test.describe(`on ${platform} in ${language}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((chosen) => {
          window.localStorage.setItem("omnileaf.language", chosen);
        }, language);
      });

      test.describe("once set up", () => {
        test.use({ backend: withLongFolders(platform, false) });

        for (const path of APP_PAGES) {
          test(`fits ${path} to the screen`, async ({ page }) => {
            await page.goto(path);
            await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

            const overflowing = await sidewaysOverflow(page);

            expect(overflowing).toEqual([]);
          });
        }
      });

      test.describe("when a folder can't be read", () => {
        test.use({
          backend: withAddFolder(platform, () => {
            throw new CommandFailure({
              code: "folderUnreadable",
              message: "the folder could not be read",
            });
          }),
        });

        test("fits the floating notice to the screen", async ({ page }) => {
          await page.goto("/");
          await page
            .getByRole("region", { name: messages.library_empty })
            .getByRole("button", { name: messages.library_add_folder })
            .click();
          await expect(page.getByRole("alert")).toContainText(
            messages.library_folder_unreadable_title,
          );

          const overflowing = await sidewaysOverflow(page, "[role=alert]");

          expect(overflowing).toEqual([]);
        });
      });

      test.describe("when a folder is added with books it couldn't read", () => {
        test.use({
          backend: withAddFolder(platform, () => ({
            name: LONG_FOLDER_NAME,
            series: 3,
            books: 7,
            unreadableBooks: 2,
            unsupportedBooks: 1,
            unreadableFolders: 1,
          })),
        });

        test("fits the add-folder report to the screen", async ({ page }) => {
          await page.goto("/settings/library");
          await page
            .getByRole("region", { name: messages.library_settings_folders })
            .getByRole("button", { name: messages.library_add_folder })
            .click();
          await expect(
            page
              .getByRole("main")
              .getByRole("status")
              .filter({ hasText: LONG_FOLDER_NAME }),
          ).toBeVisible();

          const overflowing = await sidewaysOverflow(page);

          expect(overflowing).toEqual([]);
        });
      });

      test.describe("on first launch", () => {
        test.use({ backend: withLongFolders(platform, true) });

        for (const [index, step] of FIRST_LAUNCH_STEPS.entries()) {
          test(`fits the ${step} step to the screen`, async ({ page }) => {
            await goToStep(page, messages, index);

            const overflowing = await sidewaysOverflow(page);

            expect(overflowing).toEqual([]);
          });
        }
      });
    });
  }
}
