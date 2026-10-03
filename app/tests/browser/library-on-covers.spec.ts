import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
  type OnCovers,
} from "../../src/lib/ipc/bindings.ts";
import type { ScreenSize } from "../../src/lib/library/library-view.ts";
import { fakeProtocolRoute } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  screenSizeOf,
  test,
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

/** How tall each choice's row is, with a switch below the large size and a checkbox at it. */
const SWITCH_ROW_HEIGHT = {
  phone: 48,
  tablet: 48,
  desktop: 30,
} as const satisfies Record<ScreenSize, number>;

const FIRST_TITLE = "Sample Series 0001";
const FIRST_UNREAD = 3;
const COVER_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#7fcb9d"/></svg>`;

let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;

test.use({
  backend: {
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
  },
});

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
      const toggle = options.getByRole("checkbox", { name: SWITCHES[name] });
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
      const row = options.locator("label").filter({ hasText: SWITCHES[name] });

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
