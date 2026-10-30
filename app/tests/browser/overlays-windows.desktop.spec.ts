import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  expect,
  onPlatform,
  settle,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { chapters, SectionShelf, volumes } from "./series-sections-shelf.ts";
import { SERIES_ID } from "./series-shelf.ts";

interface ThemeLook {
  readonly flyout: string;
  readonly flyoutEdge: string;
  readonly ink: string;
  readonly subtleHover: string;
  readonly dialogBand: string;
  readonly bandEdge: string;
  readonly accent: string;
}

const THEMES = {
  light: {
    flyout: "rgba(252, 252, 252, 0.85)",
    flyoutEdge: "rgba(0, 0, 0, 0.06)",
    ink: "rgba(0, 0, 0, 0.894)",
    subtleHover: "rgba(0, 0, 0, 0.035)",
    dialogBand: "rgb(243, 243, 243)",
    bandEdge: "rgba(0, 0, 0, 0.06)",
    accent: "rgb(47, 111, 79)",
  },
  dark: {
    flyout: "rgba(44, 44, 44, 0.96)",
    flyoutEdge: "rgba(0, 0, 0, 0.2)",
    ink: "rgb(255, 255, 255)",
    subtleHover: "rgba(255, 255, 255, 0.06)",
    dialogBand: "rgb(32, 32, 32)",
    bandEdge: "rgba(0, 0, 0, 0.098)",
    accent: "rgb(127, 203, 157)",
  },
} as const satisfies Record<"light" | "dark", ThemeLook>;

const WINDOWS = onPlatform("windows").backend;
const SHELF = new SectionShelf([...volumes(1, 2), ...chapters(13, 14)]);
const FIRST_BOOK = "Sample Series 04 volume 01.cbz";

const FOLDER_FOUND_EMPTY: FakeBackend = {
  ...WINDOWS,
  libraryFolders: () => ({
    folders: [
      {
        id: "2",
        kind: "linked",
        name: "Sample Comics",
        location: String.raw`C:\Comics\Sample Comics`,
        isAvailable: true,
      },
    ],
    next: null,
  }),
  libraryFolderBookCount: () => 3,
  rescanLibraryFolder: (id) => ({
    id,
    name: "Sample Comics",
    outcome: { kind: "foundEmpty" },
  }),
};

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(page.getByRole("table", { name: "Books" })).toBeVisible();
}

async function openBookMenu(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: `More for ${FIRST_BOOK}` }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await settle(menu);
  return menu;
}

async function openRemoveBooks(page: Page): Promise<Locator> {
  await page.goto("/settings/library");
  await page.getByRole("button", { name: "Rescan Sample Comics" }).click();
  await page.getByRole("button", { name: "Remove its books" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Remove its books?" });
  await expect(dialog).toBeVisible();
  await settle(dialog);
  return dialog;
}

function removeSampleComics(page: Page): Locator {
  return page.getByRole("button", { name: "Remove Sample Comics" });
}

function tooltip(page: Page): Locator {
  return page.locator("[data-tooltip-content]");
}

test.describe("Windows overlays", () => {
  testOnlyInItsWebview("windows");

  for (const [colorScheme, look] of Object.entries(THEMES)) {
    test.describe(`in the ${colorScheme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({
          colorScheme: colorScheme as "light" | "dark",
        });
      });

      test.describe("on a series", () => {
        test.use({ backend: { ...SHELF.backend(), appInfo: WINDOWS.appInfo } });

        test("opens a book's menu as a MenuFlyout on acrylic with inset 4-cornered items", async ({
          page,
        }) => {
          await openSeries(page);

          const menu = await openBookMenu(page);
          const first = menu.getByRole("menuitem").first();

          await expect(menu).toHaveCSS("background-color", look.flyout);
          await expect(menu).toHaveCSS("border-top-color", look.flyoutEdge);
          await expect(menu).toHaveCSS("border-top-left-radius", "8px");
          await expect(menu).toHaveCSS("padding", "2px 0px");
          await expect(first).toHaveCSS("margin", "2px 4px");
          await expect(first).toHaveCSS("border-top-left-radius", "4px");
          await expect(first).toHaveCSS("font-size", "14px");
          await expect(first).toHaveCSS("color", look.ink);
        });

        test("lights the menu item under the pointer without dimming its words", async ({
          page,
        }) => {
          await openSeries(page);
          const menu = await openBookMenu(page);
          const first = menu.getByRole("menuitem").first();

          await first.hover();

          await expect(first).toHaveCSS("background-color", look.subtleHover);
          await expect(first).toHaveCSS("color", look.ink);
        });

        test("parts the breadcrumb with the BreadcrumbBar's 12 chevron", async ({
          page,
        }) => {
          await openSeries(page);

          const chevron = page
            .getByRole("navigation", { name: "Breadcrumb" })
            .locator("[role=presentation] svg");

          await expect(chevron).toHaveCSS("width", "12px");
        });

        test("has no accessibility violations at rest and with the menu open", async ({
          page,
        }) => {
          await openSeries(page);
          expect(await accessibilityViolations(page)).toEqual([]);

          await openBookMenu(page);
          expect(await accessibilityViolations(page)).toEqual([]);
        });
      });

      test.describe("in Settings > Library", () => {
        test.use({ backend: FOLDER_FOUND_EMPTY });

        test("names an icon button in a ToolTip on the flyout acrylic with a 4 corner", async ({
          page,
        }) => {
          await page.goto("/settings/library");

          await removeSampleComics(page).hover();

          await expect(tooltip(page)).toBeVisible();
          await expect(tooltip(page)).toHaveCSS(
            "background-color",
            look.flyout,
          );
          await expect(tooltip(page)).toHaveCSS(
            "border-top-color",
            look.flyoutEdge,
          );
          await expect(tooltip(page)).toHaveCSS(
            "border-top-left-radius",
            "4px",
          );
          await expect(tooltip(page)).toHaveCSS("padding", "6px 9px 8px");
          await expect(tooltip(page)).toHaveCSS("font-size", "12px");
        });

        test("has no accessibility violations with the ToolTip shown", async ({
          page,
        }) => {
          await page.goto("/settings/library");

          await removeSampleComics(page).hover();
          await expect(tooltip(page)).toBeVisible();
          await settle(tooltip(page));

          expect(await accessibilityViolations(page)).toEqual([]);
        });

        test("asks in a ContentDialog that leads with the action in the accent on a darker band", async ({
          page,
        }) => {
          const dialog = await openRemoveBooks(page);
          const buttons = dialog.getByRole("button");
          const band = buttons.first().locator("..");

          await expect(buttons).toHaveText(["Remove 3 books", "Cancel"]);
          await expect(buttons.first()).toHaveCSS(
            "background-color",
            look.accent,
          );
          await expect(dialog).toHaveCSS("border-top-left-radius", "8px");
          await expect(dialog).toHaveCSS("padding-top", "24px");
          await expect(band).toHaveCSS("background-color", look.dialogBand);
          await expect(band).toHaveCSS("border-top-color", look.bandEdge);
          await expect(band).toHaveCSS("padding", "24px");
        });

        test("has no accessibility violations with the ContentDialog open", async ({
          page,
        }) => {
          await openRemoveBooks(page);

          expect(await accessibilityViolations(page)).toEqual([]);
        });
      });
    });
  }
});
