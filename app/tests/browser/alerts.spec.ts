import type { Locator, Page } from "@playwright/test";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
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
} from "./fixtures.ts";

const ICON_SIZE = 16;
const CORNER_RADIUS = 10;
const BLOCK_PADDING = 12;
const INLINE_PADDING = 16;
const TOUCH_TARGET = 48;

const SAMPLE_COMICS = {
  id: "2",
  kind: "linked",
  name: "Sample Comics",
  location: "/media/Sample Comics",
  isAvailable: true,
} as const;

const FOLDER_FOUND_EMPTY: FakeBackend = {
  ...DEFAULT_BACKEND,
  libraryFolders: () => ({ folders: [SAMPLE_COMICS], next: null }),
  libraryFolderBookCount: () => 3,
  rescanLibraryFolder: (id) => ({
    id,
    name: SAMPLE_COMICS.name,
    outcome: { kind: "foundEmpty" },
  }),
};

interface Place {
  readonly name: string;
  readonly backend: FakeBackend;
  readonly title: string;
  readonly hasDescription: boolean;
  readonly hasActions: boolean;
  readonly hasButtons: boolean;
  readonly show: (page: Page) => Promise<Locator>;
}

function alertIn(region: Locator, title: string): Locator {
  return region.locator("[data-slot=alert]").filter({ hasText: title });
}

async function rescanSampleComics(page: Page): Promise<void> {
  await page.goto("/settings/library");
  await page.getByRole("button", { name: "Rescan Sample Comics" }).click();
}

const PLACES: readonly Place[] = [
  {
    name: "no books found",
    backend: {
      ...DEFAULT_BACKEND,
      addLibraryFolder: () => ({
        name: "Sample Library",
        series: 0,
        books: 0,
        unreadableBooks: 2,
        unsupportedBooks: 0,
        unreadableFolders: 0,
      }),
    },
    title: "Found no books in Sample Library.",
    hasDescription: true,
    hasActions: false,
    hasButtons: true,
    show: async (page) => {
      await page.goto("/settings/library");
      await page
        .getByRole("region", { name: "Folders" })
        .getByRole("button", { name: "Add a folder" })
        .click();
      return alertIn(
        page.getByRole("main").getByRole("status"),
        "Found no books",
      );
    },
  },
  {
    name: "folder found empty",
    backend: FOLDER_FOUND_EMPTY,
    title: "Sample Comics looks empty",
    hasDescription: true,
    hasActions: true,
    hasButtons: true,
    show: async (page) => {
      await rescanSampleComics(page);
      return alertIn(page.getByRole("main"), "looks empty");
    },
  },
  {
    name: "books not removed",
    backend: {
      ...FOLDER_FOUND_EMPTY,
      removeBooksOfEmptiedFolder: () => {
        throw new CommandFailure({
          code: "internal",
          message: "the catalog couldn't be written",
        });
      },
    },
    title: "Couldn't remove the books",
    hasDescription: true,
    hasActions: true,
    hasButtons: true,
    show: async (page) => {
      await rescanSampleComics(page);
      await page.getByRole("button", { name: "Remove its books" }).click();
      const question = page.getByRole("alertdialog");
      await settle(question);
      await question.getByRole("button", { name: "Remove 3 books" }).click();
      return alertIn(page.getByRole("main"), "Couldn't remove the books");
    },
  },
  {
    name: "About page failure",
    backend: {
      ...DEFAULT_BACKEND,
      copyVersionDetails: () => {
        throw new CommandFailure({
          code: "clipboardUnavailable",
          message: "the clipboard could not be written",
        });
      },
    },
    title: "Couldn't copy the version details. Try again.",
    hasDescription: false,
    hasActions: false,
    hasButtons: false,
    show: async (page) => {
      await page.goto("/settings/about");
      await page.getByRole("button", { name: "Copy version details" }).click();
      return alertIn(page.getByRole("main").getByRole("alert"), "Couldn't");
    },
  },
  {
    name: "crash report failure",
    backend: {
      ...DEFAULT_BACKEND,
      offerSavedCrashReport: () => ({
        details: "Omnileaf 1.2.3 on Android\nPanic: index out of bounds\n",
        origin: "panic",
      }),
      sendCrashReport: () => {
        throw new CommandFailure({
          code: "browserUnavailable",
          message: "the browser could not be opened",
        });
      },
    },
    title: "Couldn't open your browser. Try again.",
    hasDescription: false,
    hasActions: false,
    hasButtons: false,
    show: async (page) => {
      await page.goto("/");
      const prompt = page.getByRole("alertdialog");
      await prompt
        .getByRole("button", { name: /^(Send report|Report the problem)$/ })
        .click();
      return alertIn(prompt.getByRole("alert"), "Couldn't");
    },
  },
];

async function shownAlert(page: Page, place: Place) {
  const alert = await place.show(page);
  await expect(alert).toBeVisible();
  await settle(alert);
  return {
    alert,
    icon: alert.locator(":scope > svg"),
    title: alert.locator("[data-slot=alert-title]"),
    description: alert.locator("[data-slot=alert-description]"),
    actions: alert.locator("[data-slot=alert-actions]"),
  };
}

for (const place of PLACES) {
  test.describe(`the ${place.name} alert`, () => {
    test.use({ backend: place.backend });

    test("sets a 20px icon in its own column, on the title's line", async ({
      page,
    }) => {
      const shown = await shownAlert(page, place);

      const icon = await boxOf(shown.icon);
      const title = await boxOf(shown.title);

      await expect(shown.title).toHaveText(place.title);
      await expect(shown.icon).toHaveAttribute("aria-hidden", "true");
      expect([icon.width, icon.height]).toEqual([ICON_SIZE, ICON_SIZE]);
      expect(icon.x + icon.width).toBeLessThan(title.x);
      expect(icon.y).toBeLessThan(title.y + title.height);
      expect(icon.y + icon.height).toBeGreaterThan(title.y);
    });

    test("rounds its corners and pads its content", async ({ page }) => {
      const shown = await shownAlert(page, place);

      const style = await shown.alert.evaluate((element) => {
        const computed = getComputedStyle(element);
        return [
          computed.borderTopLeftRadius,
          computed.paddingBlockStart,
          computed.paddingInlineStart,
        ].map((value) => Number.parseFloat(value));
      });

      expect(style).toEqual([CORNER_RADIUS, BLOCK_PADDING, INLINE_PADDING]);
    });

    if (place.hasDescription) {
      test("starts its description under the title, in the title's column", async ({
        page,
      }) => {
        const shown = await shownAlert(page, place);

        const title = await boxOf(shown.title);
        const description = await boxOf(shown.description);

        expect(description.x).toBeCloseTo(title.x, 0);
        expect(description.y).toBeGreaterThanOrEqual(title.y + title.height);
      });
    }

    if (place.hasActions) {
      test("puts its actions under the description, in the title's column", async ({
        page,
      }) => {
        const shown = await shownAlert(page, place);

        const title = await boxOf(shown.title);
        const description = await boxOf(shown.description);
        const actions = await boxOf(shown.actions);

        expect(actions.x).toBeCloseTo(title.x, 0);
        expect(actions.y).toBeGreaterThanOrEqual(
          description.y + description.height,
        );
      });
    }

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await shownAlert(page, place);

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    }
  });

  if (place.hasButtons) {
    test.describe(`the ${place.name} alert on an Android phone`, () => {
      testOnlyInItsWebview("android");
      test.use({
        backend: {
          ...place.backend,
          appInfo: onPlatform("android").backend.appInfo,
        },
      });
      test.skip(
        ({ viewport }) => (viewport?.width ?? 0) >= MEDIUM_MIN_WIDTH,
        "phones only",
      );

      test("keeps its buttons 48px tall", async ({ page }) => {
        const shown = await shownAlert(page, place);

        const buttons = await shown.alert.getByRole("button").all();
        const heights = await Promise.all(
          buttons.map(async (button) => (await boxOf(button)).height),
        );

        expect(heights.length).toBeGreaterThan(0);
        for (const height of heights) {
          expect(height).toBe(TOUCH_TARGET);
        }
      });
    });
  }
}
