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
  viewportOf,
} from "./fixtures.ts";

const PHONE_BADGE = 40;
const BADGE_FROM_MEDIUM = 36;
const BADGE_ICON = 18;
const TOUCH_TARGET = 48;

interface Card {
  readonly name: string;
  readonly backend: FakeBackend;
  readonly icon: string;
  readonly title: string;
  readonly body: RegExp;
  readonly open: (page: Page) => Promise<Locator>;
}

const FLOATING_NOTICE: Card = {
  name: "floating notice",
  backend: {
    ...DEFAULT_BACKEND,
    addLibraryFolder: () => {
      throw new CommandFailure({
        code: "folderUnreadable",
        message: "the folder could not be read",
      });
    },
  },
  icon: "lucide-lock",
  title: "Couldn't read that folder",
  body: /^Omnileaf may not be allowed/,
  open: async (page) => {
    await page.goto("/");
    await page
      .getByRole("region", { name: "Your library is empty" })
      .getByRole("button", { name: "Add a folder" })
      .click();
    return page.getByRole("alert").locator(":scope > *");
  },
};

const ADD_FOLDER_REPORT: Card = {
  name: "add-folder report",
  backend: {
    ...DEFAULT_BACKEND,
    addLibraryFolder: () => ({
      name: "Sample Library",
      series: 3,
      books: 7,
      unreadableBooks: 2,
      unsupportedBooks: 0,
      unreadableFolders: 0,
    }),
  },
  icon: "lucide-circle-alert",
  title: "Found 7 books in 3 series in Sample Library.",
  body: /^Couldn't read 2 books in it\.$/,
  open: async (page) => {
    await page.goto("/settings/library");
    await page
      .getByRole("region", { name: "Folders" })
      .getByRole("button", { name: "Add a folder" })
      .click();
    return page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: "Found" })
      .locator(":scope > *");
  },
};

async function shownCard(page: Page, card: Card) {
  const shown = await card.open(page);
  await expect(shown.getByText(card.title, { exact: true })).toBeVisible();
  await settle(shown);
  return {
    card: shown,
    badge: shown.locator(`span:has(> svg.${card.icon})`),
    title: shown.getByText(card.title, { exact: true }),
    body: shown.getByText(card.body),
  };
}

function lineHeightOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).lineHeight),
  );
}

function contentEdgesOf(
  locator: Locator,
): Promise<{ start: number; end: number }> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      start:
        box.left +
        Number.parseFloat(style.borderLeftWidth) +
        Number.parseFloat(style.paddingLeft),
      end:
        box.right -
        Number.parseFloat(style.borderRightWidth) -
        Number.parseFloat(style.paddingRight),
    };
  });
}

for (const card of [FLOATING_NOTICE, ADD_FOLDER_REPORT]) {
  test.describe(`the ${card.name}`, () => {
    test.use({ backend: card.backend });

    test("sets its badge beside the title, on the title's line", async ({
      page,
    }) => {
      const shown = await shownCard(page, card);

      const badge = await boxOf(shown.badge);
      const title = await boxOf(shown.title);
      const lineHeight = await lineHeightOf(shown.title);

      expect(badge.x + badge.width).toBeLessThanOrEqual(title.x);
      expect(badge.y).toBeLessThan(title.y + lineHeight);
      expect(badge.y + badge.height).toBeGreaterThan(title.y);
    });

    test("draws its badge round, 40px on phones and 36px from medium up, around an 18px icon", async ({
      page,
    }) => {
      const shown = await shownCard(page, card);
      const size =
        viewportOf(page).width < MEDIUM_MIN_WIDTH
          ? PHONE_BADGE
          : BADGE_FROM_MEDIUM;

      const badge = await boxOf(shown.badge);
      const icon = await boxOf(shown.badge.locator("svg"));
      const radius = await shown.badge.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
      );

      expect([badge.width, badge.height]).toEqual([size, size]);
      expect([icon.width, icon.height]).toEqual([BADGE_ICON, BADGE_ICON]);
      expect(radius).toBeGreaterThanOrEqual(size / 2);
      await expect(shown.badge).toHaveAttribute("aria-hidden", "true");
    });

    test("starts the body below the badge and title, across the card", async ({
      page,
    }) => {
      const shown = await shownCard(page, card);

      const badge = await boxOf(shown.badge);
      const title = await boxOf(shown.title);
      const body = await boxOf(shown.body);
      const content = await contentEdgesOf(shown.card);

      expect(body.y).toBeGreaterThanOrEqual(
        Math.max(badge.y + badge.height, title.y + title.height),
      );
      expect(body.x).toBeCloseTo(content.start, 0);
      expect(body.x + body.width).toBeCloseTo(content.end, 0);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await shownCard(page, card);

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    }
  });

  test.describe(`the ${card.name} on an Android phone`, () => {
    test.use({
      backend: {
        ...card.backend,
        appInfo: onPlatform("android").backend.appInfo,
      },
    });

    test.skip(
      ({ viewport }) => (viewport?.width ?? 0) >= MEDIUM_MIN_WIDTH,
      "phones only",
    );

    test("keeps its buttons 48px tall", async ({ page }) => {
      const shown = await shownCard(page, card);

      const buttons = await shown.card.getByRole("button").all();
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
