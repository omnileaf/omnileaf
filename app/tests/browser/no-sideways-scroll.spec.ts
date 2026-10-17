import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  APP_PAGES,
  expect,
  onPlatform,
  settle,
  sidewaysOverflow,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { goToStep } from "./first-launch-steps.ts";
import { LONG_FOLDER_NAME, longFoldersOn } from "./long-folders.ts";
import { BOOK_ID, readerBackend, servePages } from "./reader-book.ts";

const LANGUAGES = { en: english, "en-XA": pseudo } as const;
const PLATFORMS = ["ios", "android", "linux"] as const;
const FIRST_LAUNCH_STEPS = ["welcome", "home", "link", "choices", "ready"];

function withoutFolderChooser(): FakeBackend {
  return {
    ...longFoldersOn("linux"),
    addLibraryFolder: () => {
      throw new CommandFailure({
        code: "folderChooserMissing",
        message: "no desktop portal or zenity can show a folder chooser",
      });
    },
  };
}

function withAddFolder(
  platform: (typeof PLATFORMS)[number],
  addLibraryFolder: FakeBackend["addLibraryFolder"],
): FakeBackend {
  return { ...onPlatform(platform).backend, addLibraryFolder };
}

for (const platform of PLATFORMS) {
  for (const [language, messages] of Object.entries(LANGUAGES)) {
    test.describe(`on ${platform} in ${language}`, () => {
      testOnlyInItsWebview(platform);
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((chosen) => {
          window.localStorage.setItem("omnileaf.language", chosen);
        }, language);
      });

      test.describe("with a book open", () => {
        test.use({ backend: readerBackend(onPlatform(platform).backend) });

        test("fits the reader's controls to the screen", async ({ page }) => {
          await servePages(page);
          await page.goto(`/read/${BOOK_ID}`);
          await expect(page.getByRole("slider")).toBeVisible();

          const overflowing = await sidewaysOverflow(page);

          expect(overflowing).toEqual([]);
        });
      });

      test.describe("once set up", () => {
        test.use({ backend: longFoldersOn(platform) });

        for (const path of APP_PAGES) {
          test(`fits ${path} to the screen`, async ({ page }) => {
            await page.goto(path);
            await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

            const overflowing = await sidewaysOverflow(page);

            expect(overflowing).toEqual([]);
          });
        }

        test("fits a folder found empty, with its offer to remove its books", async ({
          page,
        }) => {
          await page.goto("/settings/library");
          await page
            .getByRole("button", {
              name: messages.library_rescan_folder_label.replace(
                "{name}",
                LONG_FOLDER_NAME,
              ),
            })
            .click();
          await expect(
            page.getByRole("button", { name: messages.library_remove_books }),
          ).toBeVisible();

          const overflowing = await sidewaysOverflow(page);

          expect(overflowing).toEqual([]);
        });

        test("fits the question to remove the books of a folder found empty", async ({
          page,
        }) => {
          await page.goto("/settings/library");
          await page
            .getByRole("button", {
              name: messages.library_rescan_folder_label.replace(
                "{name}",
                LONG_FOLDER_NAME,
              ),
            })
            .click();
          await page
            .getByRole("button", { name: messages.library_remove_books })
            .click();
          await expect(page.getByRole("alertdialog")).toBeVisible();

          const overflowing = await sidewaysOverflow(page);

          expect(overflowing).toEqual([]);
        });
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

        test("fits the warning toast to the screen", async ({ page }) => {
          await page.goto("/");
          await page
            .getByRole("region", { name: messages.library_empty })
            .getByRole("button", { name: messages.library_add_folder })
            .click();
          await expect(page.locator("[data-sonner-toast]")).toContainText(
            messages.library_folder_unreadable_title,
          );

          const overflowing = await sidewaysOverflow(
            page,
            "[data-sonner-toast]",
          );

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

        test("fits the add-folder result to the screen", async ({ page }) => {
          await page.goto("/settings/library");
          await page
            .getByRole("region", { name: messages.library_settings_folders })
            .getByRole("button", { name: messages.library_add_folder })
            .click();
          await expect(
            page
              .locator("[data-sonner-toast]")
              .filter({ hasText: LONG_FOLDER_NAME }),
          ).toBeVisible();

          const overflowing = await sidewaysOverflow(
            page,
            "[data-sonner-toast]",
          );

          expect(overflowing).toEqual([]);
        });
      });

      test.describe("on first launch", () => {
        test.use({
          backend: {
            ...longFoldersOn(platform),
            firstLaunchFinished: () => false,
          },
        });

        for (const [index, step] of FIRST_LAUNCH_STEPS.entries()) {
          test(`fits the ${step} step to the screen`, async ({ page }) => {
            await goToStep(page, index, messages);
            await settle(page.getByRole("main"));

            const overflowing = await sidewaysOverflow(page);

            expect(overflowing).toEqual([]);
          });
        }
      });
    });
  }
}

for (const [language, messages] of Object.entries(LANGUAGES)) {
  test.describe(`on linux without a folder chooser in ${language}`, () => {
    test.use({ backend: withoutFolderChooser() });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((chosen) => {
        window.localStorage.setItem("omnileaf.language", chosen);
      }, language);
    });

    test("fits the notice naming what to install to the screen", async ({
      page,
    }) => {
      await page.goto("/settings/library");
      await page
        .getByRole("main")
        .getByRole("button", { name: messages.library_add_folder, exact: true })
        .click();
      await expect(
        page.getByText(messages.library_folder_chooser_missing_body),
      ).toBeVisible();

      const overflowing = await sidewaysOverflow(page);

      expect(overflowing).toEqual([]);
    });
  });
}
