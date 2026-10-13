import type { Locator, Page, TestInfo } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import {
  BOOK_ID,
  NEXT_BOOK,
  readerBackend,
  servePages,
} from "./reader-book.ts";

const REMOVE_FOLDER = "Remove folder";
const NEXT_BOOK_LABEL = `Next book: ${NEXT_BOOK.title}`;

const FOLDERS_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  libraryFolders: () => ({
    folders: [
      {
        id: "1",
        kind: "home",
        name: "Omnileaf",
        location: "/data/Omnileaf",
        isAvailable: true,
      },
      {
        id: "2",
        kind: "linked",
        name: "Sample Comics",
        location: "/media/Sample Comics",
        isAvailable: true,
      },
    ],
    next: null,
  }),
};

interface IconAction {
  readonly screen: string;
  readonly backend: FakeBackend;
  readonly reach: (page: Page) => Promise<Locator>;
  readonly label: string;
}

const ICON_ACTIONS: readonly IconAction[] = [
  {
    screen: "Settings › Library",
    backend: FOLDERS_BACKEND,
    reach: async (page) => {
      await page.goto("/settings/library");
      return page.getByRole("button", { name: "Remove Sample Comics" });
    },
    label: REMOVE_FOLDER,
  },
  {
    screen: "Search",
    backend: DEFAULT_BACKEND,
    reach: async (page) => {
      await page.goto("/search");
      await page
        .getByRole("main")
        .getByRole("combobox", { name: "Search your library" })
        .pressSequentially("unread market");
      return page.getByRole("button", { name: "Remove the Unread filter" });
    },
    label: "Remove the Unread filter",
  },
  {
    screen: "the reader",
    backend: readerBackend(DEFAULT_BACKEND),
    reach: async (page) => {
      await servePages(page);
      await page.goto(`/read/${BOOK_ID}`);
      return page.getByRole("link", { name: NEXT_BOOK_LABEL });
    },
    label: NEXT_BOOK_LABEL,
  },
];

function tooltipOf(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true });
}

function removeSampleComics(page: Page): Locator {
  return page.getByRole("button", { name: "Remove Sample Comics" });
}

function isTouchScreen(testInfo: TestInfo): boolean {
  return testInfo.project.use.hasTouch === true;
}

async function holdFingerOn(action: Locator): Promise<void> {
  await action.dispatchEvent("pointerdown", {
    pointerType: "touch",
    isPrimary: true,
  });
}

async function liftFingerFrom(action: Locator): Promise<void> {
  await action.dispatchEvent("pointerup", {
    pointerType: "touch",
    isPrimary: true,
  });
  await action.dispatchEvent("click");
}

for (const { screen, backend, reach, label } of ICON_ACTIONS) {
  test.describe(`the icon actions on ${screen}`, () => {
    test.use({ backend });

    test(`names ${label} in a tooltip while the pointer rests on it`, async ({
      page,
    }) => {
      const action = await reach(page);

      await action.hover();

      await expect(tooltipOf(page, label)).toBeVisible();
      await expect(action).toHaveAccessibleDescription(label);
      await expect(action).not.toHaveAttribute("title");
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`shows the ${label} tooltip with no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        const action = await reach(page);
        await action.hover();
        await expect(tooltipOf(page, label)).toBeVisible();

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    }
  });
}

test.describe("an icon action's tooltip", () => {
  test.use({ backend: FOLDERS_BACKEND });

  test("shows when the keyboard reaches the action, leaving focus on it", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    const remove = removeSampleComics(page);
    await expect(remove).toBeVisible();
    await page.getByRole("button", { name: "Rescan Sample Comics" }).focus();

    await page.keyboard.press("Tab");

    await expect(tooltipOf(page, REMOVE_FOLDER)).toBeVisible();
    await expect(remove).toBeFocused();
  });

  test("goes away when the keyboard moves on", async ({ page }) => {
    await page.goto("/settings/library");
    await page.getByRole("button", { name: "Rescan Sample Comics" }).focus();
    await page.keyboard.press("Tab");
    await expect(tooltipOf(page, REMOVE_FOLDER)).toBeVisible();

    await page.keyboard.press("Tab");

    await expect(tooltipOf(page, REMOVE_FOLDER)).toHaveCount(0);
  });

  test("shows once a finger is held on the action, without running it", async ({
    page,
  }, testInfo) => {
    test.skip(!isTouchScreen(testInfo), "touch screens only");
    await page.goto("/settings/library");
    const remove = removeSampleComics(page);
    await expect(remove).toBeVisible();

    await holdFingerOn(remove);
    await expect(tooltipOf(page, REMOVE_FOLDER)).toBeVisible();
    await liftFingerFrom(remove);

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("stays hidden on a tap, which runs the action", async ({
    page,
  }, testInfo) => {
    test.skip(!isTouchScreen(testInfo), "touch screens only");
    await page.goto("/settings/library");

    const remove = removeSampleComics(page);

    await remove.tap();

    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(remove).toHaveAccessibleDescription("");
  });
});
