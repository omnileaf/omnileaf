import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
  type OnCovers,
} from "../../src/lib/ipc/bindings.ts";
import type { ScreenSize } from "../../src/lib/library/library-view.ts";
import { type FakeBackend, fakeProtocolRoute } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  onPlatform,
  screenSizeOf,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { choose, openViewOptions } from "./view-options.ts";

const SWITCHES = {
  showsUnreadCount: "Unread count",
  showsDownloaded: "Downloaded",
  showsLanguage: "Language",
  showsReadingProgress: "Reading progress",
  showsContinueButton: "Continue reading button",
} as const satisfies Record<keyof OnCovers, string>;

const SWITCH_NAMES = Object.keys(SWITCHES) as (keyof OnCovers)[];

const SWITCH_ROW_HEIGHT = {
  phone: 56,
  tablet: 56,
  desktop: 48,
} as const satisfies Record<ScreenSize, number>;

const BADGE_INSET = {
  phone: 5,
  tablet: 7,
  desktop: 8,
} as const satisfies Record<ScreenSize, number>;

const UNREAD_BADGE_SIZE = 24;

const FIRST_TITLE = "Sample Series 0001";
const SECOND_TITLE = "Sample Series 0002";
const FIRST_UNREAD = 3;
const COVER_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#7fcb9d"/></svg>`;

let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;

const COVERS_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: pagedSeries(() =>
    sampleSeries(60).map((series, index) => ({
      ...series,
      bookCount: 4,
      unreadCount: index === 0 ? FIRST_UNREAD : index === 1 ? 0 : 4,
      cover: `thumb/v1/0190a3e4-0000-8000-8000-000000000001/${String(index + 1)}/1`,
    })),
  ),
  libraryView: () => storedView,
  setLibraryView: (view) => {
    storedView = view;
    return null;
  },
};

test.use({ backend: COVERS_BACKEND });

test.beforeEach(async ({ page }) => {
  storedView = DEFAULT_LIBRARY_VIEW;
  await page.route(fakeProtocolRoute("omni"), (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: COVER_IMAGE }),
  );
});

function seriesNamed(page: Page, title: string): Locator {
  return page
    .getByRole("list", { name: "Series" })
    .getByRole("listitem")
    .filter({ hasText: title });
}

function unreadBadge(series: Locator, count: number): Locator {
  return series.getByRole("img", { name: `${String(count)} unread` });
}

async function openWith(page: Page, view: Partial<LibraryView>) {
  storedView = { ...DEFAULT_LIBRARY_VIEW, ...view };
  await page.goto("/");
  await expect(seriesNamed(page, FIRST_TITLE)).toBeVisible();
}

test.describe("show on covers", () => {
  test("starts a new library with the unread count, downloaded and reading progress on", async ({
    page,
  }) => {
    await openWith(page, {});

    const options = await openViewOptions(page);

    await expect(
      options.getByRole("group", { name: "Show on covers" }),
    ).toBeVisible();
    for (const name of SWITCH_NAMES) {
      const toggle = options.getByRole("switch", { name: SWITCHES[name] });
      await expect(toggle).toBeChecked({
        checked: DEFAULT_LIBRARY_VIEW.onCovers[name],
      });
    }
  });

  test("gives each choice a row as tall as this size draws it", async ({
    page,
  }) => {
    const height = SWITCH_ROW_HEIGHT[screenSizeOf(page)];
    await openWith(page, {});
    const options = await openViewOptions(page);

    for (const name of SWITCH_NAMES) {
      const row = options.getByRole("switch", { name: SWITCHES[name] });

      expect((await boxOf(row)).height).toBe(height);
    }
  });

  test("stores each choice of what covers show on this device", async ({
    page,
  }) => {
    await openWith(page, {});
    const options = await openViewOptions(page);

    for (const name of SWITCH_NAMES) {
      await choose(options, SWITCHES[name]);

      await expect
        .poll(() => storedView.onCovers[name])
        .toBe(!DEFAULT_LIBRARY_VIEW.onCovers[name]);
    }
  });
});

test.describe("unread count", () => {
  for (const display of ["grid", "compact"] as const) {
    test(`draws each series' unread count at the top start of its cover in the ${display} display`, async ({
      page,
    }) => {
      const inset = BADGE_INSET[screenSizeOf(page)];
      await openWith(page, { display });
      const first = seriesNamed(page, FIRST_TITLE);

      const badge = await boxOf(unreadBadge(first, FIRST_UNREAD));
      const cover = await boxOf(first.getByRole("presentation"));

      expect(badge.x - cover.x).toBeCloseTo(inset, 0);
      expect(badge.y - cover.y).toBeCloseTo(inset, 0);
      await expect(unreadBadge(first, FIRST_UNREAD)).toHaveText(
        String(FIRST_UNREAD),
      );
    });
  }

  for (const platform of ["android", "linux"] as const) {
    test.describe(`on ${platform}`, () => {
      testOnlyInItsWebview(platform);
      test.use({
        backend: {
          ...COVERS_BACKEND,
          appInfo: onPlatform(platform).backend.appInfo,
        },
      });

      test("draws a cover's unread count as a 24px badge in 12px medium type", async ({
        page,
      }) => {
        await openWith(page, {});
        const badge = unreadBadge(seriesNamed(page, FIRST_TITLE), FIRST_UNREAD);

        const box = await boxOf(badge);
        const look = await badge.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            padding: [
              style.paddingTop,
              style.paddingRight,
              style.paddingBottom,
              style.paddingLeft,
            ],
          };
        });

        expect({ height: box.height, ...look }).toEqual({
          height: UNREAD_BADGE_SIZE,
          fontSize: "12px",
          fontWeight: "500",
          padding: ["0px", "6px", "0px", "6px"],
        });
        expect(box.width).toBeGreaterThanOrEqual(UNREAD_BADGE_SIZE);
      });
    });
  }

  test("ends each list row with its series' unread count", async ({ page }) => {
    await openWith(page, { display: "list" });
    const first = seriesNamed(page, FIRST_TITLE);

    const badge = await boxOf(unreadBadge(first, FIRST_UNREAD));
    const title = await boxOf(first.getByText(FIRST_TITLE));

    expect(badge.x).toBeGreaterThan(title.x + title.width);
    await expect(unreadBadge(first, FIRST_UNREAD)).toHaveText(
      String(FIRST_UNREAD),
    );
  });

  test("starts the unread count at the cover's right in a right-to-left layout", async ({
    page,
  }) => {
    const inset = BADGE_INSET[screenSizeOf(page)];
    await openWith(page, {});
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    const first = seriesNamed(page, FIRST_TITLE);

    const badge = await boxOf(unreadBadge(first, FIRST_UNREAD));
    const cover = await boxOf(first.getByRole("presentation"));

    expect(cover.x + cover.width - (badge.x + badge.width)).toBeCloseTo(
      inset,
      0,
    );
  });

  test("draws no unread count on a series with every book read", async ({
    page,
  }) => {
    await openWith(page, {});

    const second = seriesNamed(page, SECOND_TITLE);

    await expect(second.getByRole("img", { name: /unread/ })).toHaveCount(0);
  });

  test("takes the unread counts off the covers once they're turned off", async ({
    page,
  }) => {
    await openWith(page, {});
    const first = seriesNamed(page, FIRST_TITLE);
    await expect(unreadBadge(first, FIRST_UNREAD)).toBeVisible();
    const options = await openViewOptions(page);

    await choose(options, SWITCHES.showsUnreadCount);

    await expect(unreadBadge(first, FIRST_UNREAD)).toHaveCount(0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the unread counts have no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openWith(page, {});
      await expect(
        unreadBadge(seriesNamed(page, FIRST_TITLE), FIRST_UNREAD),
      ).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
