import type { Locator, Page } from "@playwright/test";

import {
  CommandFailure,
  emitFakeEvent,
  type FakeBackend,
} from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  expect,
  EXPANDED_MIN_WIDTH,
  framesPassed,
  test,
  viewportOf,
} from "./fixtures.ts";
import { expectPhone, isPhonePlatform } from "./phone-platform.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READ = { state: "read" } as const;
const CREATOR = "Author A";
const THEIR_SERIES = [
  {
    id: SERIES_ID,
    title: SERIES_TITLE,
    cover: null,
    role: "storyAndArt",
  },
  {
    id: "0190a3e4-0000-8000-8000-0000000000b1",
    title: "Sample Series 07",
    cover: null,
    role: "story",
  },
  {
    id: "0190a3e4-0000-8000-8000-0000000000b2",
    title: "Sample Series 01",
    cover: null,
    role: null,
  },
] as const;
const LONG_NAME =
  "Sample_Creator_Whose_Pen_Name_Runs_On_Without_A_Single_Space_Between";
const UNBROKEN_TITLE =
  "Sample_Series_Scanned_From_The_Collectors_Edition_Box_Set_Volumes_01_To_24";

function backendWith(found: typeof THEIR_SERIES | readonly []): FakeBackend {
  return {
    ...new FakeShelf([READ], {
      creators: [
        { name: CREATOR, role: "storyAndArt", seriesCount: 3 },
        { name: "Author C", role: "art", seriesCount: 1 },
      ],
    }).backend(),
    creatorSeries: (creator) =>
      creator === CREATOR ? found.map((series) => ({ ...series })) : [],
  };
}

const CATALOG_UNREADABLE = "the catalog could not be read";

const creatorRead = { fails: true, held: Promise.resolve(), asked: 0 };

function backendFailingWhileAsked(): FakeBackend {
  const found = backendWith(THEIR_SERIES);
  return {
    ...found,
    creatorSeries: async (creator) => {
      creatorRead.asked += 1;
      await creatorRead.held;
      if (creatorRead.fails) {
        throw new CommandFailure({
          code: "internal",
          message: CATALOG_UNREADABLE,
        });
      }
      return found.creatorSeries(creator);
    },
  };
}

function failureHeading(page: Page): Locator {
  return page.getByRole("heading", {
    level: 1,
    name: `Couldn't read the series by ${CREATOR}`,
  });
}

function failure(page: Page): Locator {
  return page.getByRole("alert").filter({ has: failureHeading(page) });
}

function tryAgain(page: Page): Locator {
  return failure(page).getByRole("button", { name: "Try again" });
}

function backToLibrary(page: Page): Locator {
  return failure(page).getByRole("link", { name: "Back to the library" });
}

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

async function openLongNamedCreator(page: Page): Promise<void> {
  await page.goto(
    `/creator/${encodeURIComponent(LONG_NAME)}?from=${SERIES_ID}`,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: LONG_NAME }),
  ).toBeVisible();
}

function creatorHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: CREATOR, exact: true });
}

async function clickCreatorOnSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("region", { name: "About this series" })
    .getByRole("link", { name: CREATOR })
    .first()
    .click();
}

async function openCreatorFromSeries(page: Page): Promise<void> {
  await clickCreatorOnSeries(page);
  await expect(creatorHeading(page)).toBeVisible();
}

async function openFailedCreator(page: Page): Promise<void> {
  await clickCreatorOnSeries(page);
  await expect(failureHeading(page)).toBeVisible();
}

async function tryAgainAndFailAgain(page: Page): Promise<void> {
  await failure(page).evaluate((alert) => {
    alert.dataset.firstAnnounced = "";
  });
  await tryAgain(page).click();
  await expect(page.locator("[data-first-announced]")).toHaveCount(0);
}

test.describe("a creator with series in the library", () => {
  test.use({ backend: backendWith(THEIR_SERIES) });

  test("links a creator with other series, and leaves one with only this series as text", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);
    const details = page.getByRole("region", { name: "About this series" });

    await expect(
      details.getByRole("link", { name: CREATOR }).first(),
    ).toBeVisible();
    await expect(details.getByRole("link", { name: "Author C" })).toHaveCount(
      0,
    );
  });

  test("lists their series with what they did on each", async ({ page }) => {
    await openCreatorFromSeries(page);
    const items = page
      .getByRole("list", { name: `Series by ${CREATOR}` })
      .getByRole("listitem");

    await expect(page.getByText("3 series in your library")).toBeVisible();
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("Story and art");
    await expect(items.nth(1)).toContainText("Story");
    await expect(items.nth(2)).toHaveText("Sample Series 01");
  });

  test("goes back to the series it was opened from", async ({ page }) => {
    await openCreatorFromSeries(page);

    await (
      isWide(page)
        ? page
            .getByRole("navigation", { name: "Breadcrumb" })
            .getByRole("link", { name: SERIES_TITLE })
        : page.getByRole("link", { name: `Back to ${SERIES_TITLE}` })
    ).click();

    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openCreatorFromSeries(page);

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("a creator whose series change while their page is open", () => {
  const shown = {
    series: THEIR_SERIES as readonly (typeof THEIR_SERIES)[number][],
  };

  test.use({
    backend: {
      ...backendWith(THEIR_SERIES),
      creatorSeries: (creator) =>
        creator === CREATOR
          ? shown.series.map((series) => ({ ...series }))
          : [],
    },
  });

  test.beforeEach(() => {
    shown.series = THEIR_SERIES;
  });

  test("reads their series again when the library changes", async ({
    page,
  }) => {
    await openCreatorFromSeries(page);
    const items = page
      .getByRole("list", { name: `Series by ${CREATOR}` })
      .getByRole("listitem");
    await expect(items).toHaveCount(3);

    shown.series = THEIR_SERIES.slice(0, 1);
    await emitFakeEvent(page, "library-changed");

    await expect(items).toHaveCount(1);
  });
});

test.describe("a creator whose series have gone", () => {
  test.use({ backend: backendWith([]) });

  test("says none of their series is left and leads back to the library", async ({
    page,
  }) => {
    await openCreatorFromSeries(page);

    await expect(
      page.getByRole("heading", {
        level: 2,
        name: `No series by ${CREATOR} in your library`,
      }),
    ).toBeVisible();
    await page
      .getByRole("main")
      .getByRole("link", { name: "Back to the library" })
      .last()
      .click();

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("a creator with a long name and a series with an unbroken title", () => {
  test.use({
    backend: {
      ...new FakeShelf([READ], {
        creators: [{ name: LONG_NAME, role: "storyAndArt", seriesCount: 2 }],
      }).backend(),
      creatorSeries: () => [
        {
          id: "0190a3e4-0000-8000-8000-0000000000b1",
          title: UNBROKEN_TITLE,
          cover: null,
          role: "story",
        },
      ],
    },
  });

  test("wraps an unbroken series title inside its cover's column", async ({
    page,
  }) => {
    await openLongNamedCreator(page);

    const hidden = await page
      .getByRole("list", { name: `Series by ${LONG_NAME}` })
      .getByText(UNBROKEN_TITLE)
      .evaluate((title) => title.scrollWidth - title.clientWidth);

    expect(hidden).toBe(0);
  });

  test.describe("on the desktop's toolbar", () => {
    test.use({ viewport: { width: EXPANDED_MIN_WIDTH, height: 800 } });
    test.skip(({ isMobile }) => isMobile, "the desktop's toolbar");

    test("keeps Library whole in the toolbar beside a long name", async ({
      page,
    }) => {
      await openLongNamedCreator(page);
      const crumbs = page
        .locator("[data-page-toolbar]")
        .getByRole("navigation", { name: "Breadcrumb" });
      const library = page.getByRole("link", { name: "Library" });

      const link = await boxOf(crumbs.getByRole("link", { name: "Library" }));
      const crumb = await boxOf(
        crumbs.getByRole("listitem").filter({ has: library }),
      );

      expect(link.x + link.width).toBeLessThanOrEqual(crumb.x + crumb.width);
    });
  });
});

const PHONE_COVER_CORNER = { ios: "6px", android: "4px" } as const;
const PHONE_BUTTON_HEIGHT = { ios: 50, android: 40 } as const;
const TABLET = { width: 820, height: 1180 };

function backToSeries(page: Page): Locator {
  return page.getByRole("link", { name: `Back to ${SERIES_TITLE}` });
}

test.describe("a creator on a phone", { tag: "@native" }, () => {
  test.skip(({ platform }) => !isPhonePlatform(platform), "phones only");

  test.use({ backend: backendWith(THEIR_SERIES) });

  test("shows the way back as a circle holding only its chevron, above the name", async ({
    page,
    platform,
  }) => {
    expectPhone(platform);

    await openCreatorFromSeries(page);
    const back = await boxOf(backToSeries(page));
    const name = await boxOf(page.getByRole("heading", { level: 1 }));

    expect(back.width).toBeCloseTo(back.height, 0);
    await expect(backToSeries(page)).toHaveText("");
    expect(name.y).toBeGreaterThanOrEqual(back.y + back.height);
  });

  test("keeps the named way back on an iPad", async ({ page, platform }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await page.setViewportSize(TABLET);

    await openCreatorFromSeries(page);

    await expect(backToSeries(page)).toHaveText(SERIES_TITLE);
  });

  test("rounds each cover as the phone's own tile", async ({
    page,
    platform,
  }) => {
    expectPhone(platform);

    await openCreatorFromSeries(page);
    const cover = page
      .getByRole("list", { name: `Series by ${CREATOR}` })
      .getByRole("link")
      .first()
      .locator(":scope > span")
      .first();

    await expect(cover).toHaveCSS(
      "border-top-left-radius",
      PHONE_COVER_CORNER[platform],
    );
  });
});

test.describe(
  "a creator whose series have gone, on a phone",
  { tag: "@native" },
  () => {
    test.skip(({ platform }) => !isPhonePlatform(platform), "phones only");

    test.use({ backend: backendWith([]) });

    test("leads back to the library with the phone's own second button", async ({
      page,
      platform,
    }) => {
      expectPhone(platform);

      await openCreatorFromSeries(page);
      const button = await boxOf(
        page
          .getByRole("main")
          .getByRole("link", { name: "Back to the library" })
          .last(),
      );

      expect(button.height).toBeCloseTo(PHONE_BUTTON_HEIGHT[platform], 0);
    });
  },
);

test.describe("a creator whose series can't be read", () => {
  test.use({ backend: backendFailingWhileAsked() });

  test.beforeEach(() => {
    creatorRead.fails = true;
    creatorRead.held = Promise.resolve();
  });

  test("says their series couldn't be read and that nothing changed", async ({
    page,
  }) => {
    await openFailedCreator(page);

    await expect(failure(page)).toContainText(
      "Nothing in your library has changed.",
    );
  });

  test("leaves the crash prompt closed, since the failure screen explains it", async ({
    page,
  }) => {
    await openFailedCreator(page);

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("reads their series again on Try again and moves focus to their name", async ({
    page,
  }) => {
    await openFailedCreator(page);
    creatorRead.fails = false;

    await tryAgain(page).click();

    await expect(
      page
        .getByRole("list", { name: `Series by ${CREATOR}` })
        .getByRole("listitem"),
    ).toHaveCount(THEIR_SERIES.length);
    await expect(failure(page)).toHaveCount(0);
    await expect(creatorHeading(page)).toBeFocused();
  });

  test("holds Try again busy while it reads again", async ({ page }) => {
    await openFailedCreator(page);
    const answer = Promise.withResolvers<undefined>();
    creatorRead.held = answer.promise;
    creatorRead.fails = false;

    await tryAgain(page).click();

    await expect(tryAgain(page)).toHaveAttribute("aria-busy", "true");
    await expect(tryAgain(page)).toHaveAttribute("aria-disabled", "true");
    answer.resolve(undefined);
    await expect(creatorHeading(page)).toBeVisible();
  });

  test("keeps focus on Try again while it reads again", async ({ page }) => {
    await openFailedCreator(page);
    const answer = Promise.withResolvers<undefined>();
    creatorRead.held = answer.promise;
    await tryAgain(page).focus();

    await page.keyboard.press("Enter");
    await expect(tryAgain(page)).toHaveAttribute("aria-busy", "true");
    await framesPassed(page);

    await expect(tryAgain(page)).toBeFocused();
    answer.resolve(undefined);
  });

  test("reads once however often Try again is pressed while it reads", async ({
    page,
  }) => {
    await openFailedCreator(page);
    const answer = Promise.withResolvers<undefined>();
    creatorRead.held = answer.promise;
    creatorRead.fails = false;
    const askedBefore = creatorRead.asked;
    await tryAgain(page).focus();

    await page.keyboard.press("Enter");
    await expect(tryAgain(page)).toHaveAttribute("aria-busy", "true");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    answer.resolve(undefined);

    await expect(creatorHeading(page)).toBeVisible();
    expect(creatorRead.asked - askedBefore).toBe(1);
  });

  test("announces the failure again when Try again fails too", async ({
    page,
  }) => {
    await openFailedCreator(page);

    await tryAgainAndFailAgain(page);

    await expect(failure(page)).toBeVisible();
  });

  test("keeps focus on Try again when Try again fails too", async ({
    page,
  }) => {
    await openFailedCreator(page);

    await tryAgainAndFailAgain(page);

    await expect(tryAgain(page)).toBeFocused();
  });

  test("sets Try again apart from Back to the library", async ({ page }) => {
    await openFailedCreator(page);

    const backgroundOf = (control: Locator): Promise<string> =>
      control.evaluate((element) => getComputedStyle(element).backgroundColor);

    expect(await backgroundOf(tryAgain(page))).not.toBe(
      await backgroundOf(backToLibrary(page)),
    );
  });

  test("leads back to the library", async ({ page }) => {
    await openFailedCreator(page);

    await backToLibrary(page).click();

    await expect(page).toHaveURL(/\/$/);
  });

  test("has no accessibility violations", async ({ page }) => {
    await openFailedCreator(page);
    await expect(failure(page)).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
});

test.describe(
  "a creator whose series can't be read, on a phone",
  { tag: "@native" },
  () => {
    test.use({ backend: backendFailingWhileAsked() });

    test.beforeEach(() => {
      creatorRead.fails = true;
      creatorRead.held = Promise.resolve();
    });

    test("starts its badge, title and note on Android and centres them on iOS, as each phone's problem screens do", async ({
      page,
      platform,
    }) => {
      test.skip(platform === undefined, "the native phone projects only");
      await openFailedCreator(page);

      const expected = platform === "ios" ? "center" : "start";
      const shownBadge = await boxOf(
        failure(page).locator('[data-slot="empty-media"]'),
      );
      const title = await boxOf(failureHeading(page));

      await expect(failureHeading(page)).toHaveCSS("text-align", expected);
      await expect(
        failure(page).getByText("Nothing in your library has changed."),
      ).toHaveCSS("text-align", expected);
      expect(title.y).toBeGreaterThanOrEqual(shownBadge.y + shownBadge.height);
      const badgeEdge =
        expected === "start"
          ? shownBadge.x
          : shownBadge.x + shownBadge.width / 2;
      const titleEdge =
        expected === "start" ? title.x : title.x + title.width / 2;
      expect(badgeEdge).toBeCloseTo(titleEdge, 0);
    });

    test("keeps focus on Try again when Try again fails too", async ({
      page,
      platform,
    }) => {
      test.skip(platform === undefined, "the native phone projects only");
      await openFailedCreator(page);

      await tryAgainAndFailAgain(page);

      await expect(tryAgain(page)).toBeFocused();
    });

    test("centres Try again over Back to the library as iOS capsules of one width", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios") {
        test.skip();
        return;
      }

      await openFailedCreator(page);
      const again = await boxOf(tryAgain(page));
      const back = await boxOf(backToLibrary(page));

      expect(back.y).toBeGreaterThan(again.y + again.height);
      expect(back.width).toBeCloseTo(again.width, 0);
      expect(again.x + again.width / 2).toBeCloseTo(
        viewportOf(page).width / 2,
        0,
      );
      expect(again.height).toBeCloseTo(PHONE_BUTTON_HEIGHT.ios, 0);
      const corner = await tryAgain(page).evaluate((button) =>
        parseFloat(getComputedStyle(button).borderTopLeftRadius),
      );
      expect(corner).toBeGreaterThanOrEqual(again.height / 2);
    });

    test("stacks Try again over Back to the library at each one's own width on Android", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }

      await openFailedCreator(page);
      const again = await boxOf(tryAgain(page));
      const back = await boxOf(backToLibrary(page));

      expect(back.y).toBeGreaterThan(again.y + again.height);
      expect(back.width).not.toBeCloseTo(again.width, 0);
      expect(again.height).toBeCloseTo(PHONE_BUTTON_HEIGHT.android, 0);
      expect(back.height).toBeCloseTo(PHONE_BUTTON_HEIGHT.android, 0);
    });

    test("keeps the problem screens' own rounded buttons on an iPad", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios") {
        test.skip();
        return;
      }
      await page.setViewportSize(TABLET);

      await openFailedCreator(page);
      const again = await boxOf(tryAgain(page));
      const corner = await tryAgain(page).evaluate((button) =>
        parseFloat(getComputedStyle(button).borderTopLeftRadius),
      );

      expect(corner).toBeLessThan(again.height / 2);
    });
  },
);
