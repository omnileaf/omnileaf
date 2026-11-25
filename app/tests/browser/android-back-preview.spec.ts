import type { Locator, Page } from "@playwright/test";

import type { BackSwipe, SeriesDetails } from "../../src/lib/ipc/bindings.ts";
import { sampleSeriesId } from "../../src/lib/sample-library/sample-library.ts";
import { emitFakeEvent, type FakeChannel } from "./fake-backend.ts";
import { sampleLibraryOn } from "./screens.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";
import {
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  fakeAppInfo,
  test,
  viewportOf,
} from "./fixtures.ts";

const SCREEN_CORNER_PX = 32;
const SMALLEST_SCALE = 0.9;
const EDGE_MARGIN_PX = 8;
const PRIVACY = "/settings/privacy";
const PERMISSIONS = "/settings/privacy/permissions";
const COMMIT_MS = 450;
const BEFORE_THE_COMMIT_ENDS_MS = COMMIT_MS - 50;
const PAST_THE_COMMIT_MS = 100;
const COMMIT_PLAYED_MS = COMMIT_MS + PAST_THE_COMMIT_MS;
const SETTINGS = "/settings";
const SETTINGS_TITLE = "Settings";
const PRIVACY_TITLE = "Privacy and security";
const LIGHT_SCRIM = "rgba(0, 0, 0, 0.2)";
const PRIVACY_ONLY_TEXT = "Crash reports";
const PHONE = { width: 412, height: 700 };
const VOLUMES_SERIES = `/series/${sampleSeriesId(21)}`;
const VOLUME_PAGE = `${VOLUMES_SERIES}/volume/2`;
const SEARCH = "/search?q=Sample";
const LIBRARY = "/";
const CREDITED_SERIES = `/series/${sampleSeriesId(4)}`;
const SERIES_DOWN = 250;
const LIBRARY_DOWN = 1200;
const SCROLL_SLACK_PX = 2;

const SPRING_BACK_SETTLED_MS = 200;
const PAUSED_AFTER_MS = 1000;
const EDITED_TITLE = "Sample Series Renamed";
const SERIES_DETAILS = {
  title: { fromFile: SERIES_TITLE, source: "folderName", edited: null },
  people: { fromFile: [], edited: null },
  tags: { fromFile: [], edited: null },
  summary: { fromFile: null, edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;
let gestures: FakeChannel<BackSwipe> | undefined;

test.use({
  platform: "android",
  backend: {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("android"),
    watchBackSwipes: (channel) => {
      gestures = channel;
      return null;
    },
  },
});

test.beforeEach(() => {
  gestures = undefined;
});

async function gesture(step: BackSwipe): Promise<void> {
  await expect.poll(() => gestures).toBeDefined();
  await gestures?.send(step);
}

function swipe(
  progress: number,
  change: Partial<Extract<BackSwipe, { kind: "moved" }>> = {},
): BackSwipe {
  return {
    kind: "moved",
    progress,
    edge: "left",
    touchY: 0.5,
    corner: SCREEN_CORNER_PX,
    ...change,
  };
}

function start(
  change: Partial<Extract<BackSwipe, { kind: "started" }>> = {},
): BackSwipe {
  return {
    kind: "started",
    progress: 0,
    edge: "left",
    touchY: 0.5,
    corner: SCREEN_CORNER_PX,
    ...change,
  };
}

async function expectNoPreviewLeft(page: Page): Promise<void> {
  const main = page.getByRole("main");
  await expect(main).toHaveCSS("transform", "none");
  await expect(main).toHaveCSS("border-top-left-radius", "0px");
  await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
  await expect(page.locator("[data-leaving-screen]")).toHaveCount(0);
}

async function pauseTheClock(page: Page): Promise<void> {
  await page.clock.install();
  await page.clock.pauseAt(
    (await page.evaluate(() => Date.now())) + PAUSED_AFTER_MS,
  );
}

async function openInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((href) => {
    const link = document.createElement("a");
    link.href = href;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await expect(page).toHaveURL(path);
}

async function openPrivacyFromSettings(page: Page): Promise<void> {
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "Settings opens its pages beside the list on a wide screen",
  );
  await page.goto(SETTINGS);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await openInApp(page, PRIVACY);
}

async function widthOf(page: Page): Promise<number> {
  return page.getByRole("main").evaluate((main) => main.clientWidth);
}

interface Placement {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

async function placementOf(page: Page): Promise<Placement> {
  return page.getByRole("main").evaluate((main) => {
    const { a, e, f } = new DOMMatrixReadOnly(getComputedStyle(main).transform);
    return { scale: a, x: e, y: f };
  });
}

test("shrinks a page swiped from the left to 90% and moves it to 8 px from the right edge, with the screen's corners", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);
  const width = await widthOf(page);
  await gesture(start());

  await gesture(swipe(1));

  const shift = (width - width * SMALLEST_SCALE) / 2 - EDGE_MARGIN_PX;
  await expect.poll(async () => (await placementOf(page)).x).toBeCloseTo(shift);
  expect((await placementOf(page)).scale).toBeCloseTo(SMALLEST_SCALE);
  await expect(page.getByRole("main")).toHaveCSS(
    "border-top-left-radius",
    `${String(SCREEN_CORNER_PX)}px`,
  );
});

test("shrinks a page swiped from the right in the middle", async ({ page }) => {
  await openPrivacyFromSettings(page);
  await gesture(start({ edge: "right" }));

  await gesture(swipe(1, { edge: "right" }));

  await expect(page.getByRole("main")).toHaveCSS(
    "transform",
    "matrix(0.9, 0, 0, 0.9, 0, 0)",
  );
});

test("follows the finger down the screen", async ({ page }) => {
  await openPrivacyFromSettings(page);
  await gesture(start());

  await gesture(swipe(1, { touchY: 0.9 }));

  await expect.poll(async () => (await placementOf(page)).y).toBeGreaterThan(0);
});

test("shows the page it goes back to behind the shrinking page, dimmed", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);
  await gesture(start());

  await gesture(swipe(0.5));

  const behind = page.locator("[data-previous-screen]");
  await expect(behind.locator("h1")).toHaveText(SETTINGS_TITLE);
  await expect(behind).not.toContainText(PRIVACY_ONLY_TEXT);
  await expect(behind.locator("div").last()).toHaveCSS(
    "background-color",
    LIGHT_SCRIM,
  );
});

test("springs the page back and takes the page behind away when the gesture is cancelled", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);
  await pauseTheClock(page);
  await gesture(start());
  await gesture(swipe(1));

  await gesture({ kind: "cancelled" });
  await page.clock.runFor(SPRING_BACK_SETTLED_MS);

  await expect(page.getByRole("main")).toHaveCSS("transform", "none");
  await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
});

test("lets the page leave and settles the page behind in its place once back goes through", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);
  await pauseTheClock(page);
  await gesture(start());
  await gesture(swipe(1));

  await page.goBack();

  await expect(page).toHaveURL(SETTINGS);
  await expect(page.locator("[data-leaving-screen]")).toBeAttached();
  await page.clock.runFor(BEFORE_THE_COMMIT_ENDS_MS);
  await expect(page.locator("[data-leaving-screen]")).toBeAttached();
  await page.clock.runFor(PAST_THE_COMMIT_MS);
  await expectNoPreviewLeft(page);
});

test("shows the page before the one gone back to behind a second gesture that starts as the leave plays", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);
  await openInApp(page, PERMISSIONS);
  await pauseTheClock(page);
  await gesture(start());
  await gesture(swipe(1));
  await page.goBack();
  await expect(page).toHaveURL(PRIVACY);
  await expect(page.locator("[data-leaving-screen]")).toBeAttached();

  await gesture(start());
  await gesture(swipe(0.5));

  await expect(page.locator("[data-previous-screen] h1").first()).toHaveText(
    SETTINGS_TITLE,
  );
});

test("neither shrinks nor moves the page when reduced motion is on", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPrivacyFromSettings(page);
  await gesture(start());

  await gesture(swipe(1, { touchY: 0.9 }));

  await expect(page.getByRole("main")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  await expect(page.getByRole("main")).toHaveCSS(
    "border-top-left-radius",
    "0px",
  );
});

test("puts the screen back when a finished back gesture closes something on the screen without leaving it", async ({
  page,
}) => {
  await page.goto("/settings/privacy");
  const screen = page.getByRole("main");
  await page.evaluate(() => {
    history.pushState(history.state, "", location.href);
  });
  await pauseTheClock(page);
  await gesture(start());
  await gesture({ kind: "moved", progress: 0.3 });
  await expect(screen).not.toHaveCSS("transform", "none");

  await page.goBack();
  await page.clock.runFor(SPRING_BACK_SETTLED_MS);

  await expect(screen).toHaveCSS("transform", "none");
  await expect(screen).toHaveCSS("border-top-left-radius", "0px");
  expect(new URL(page.url()).pathname).toBe("/settings/privacy");
});

test("leaves no preview once back goes through, even when the gesture's last moves arrive after the page steps back", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);
  await pauseTheClock(page);
  await gesture(start());
  await gesture(swipe(0.6));

  await page.goBack();
  await gesture(swipe(0.6));
  await expect(page).toHaveURL(SETTINGS);
  await page.clock.runFor(COMMIT_PLAYED_MS);

  await expectNoPreviewLeft(page);
});

test("leaves no preview once the gesture is cancelled, even when moves arrive after it", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);
  await pauseTheClock(page);
  await gesture(start());
  await gesture(swipe(0.6));

  await gesture({ kind: "cancelled" });
  await gesture(swipe(0.3));
  await page.clock.runFor(SPRING_BACK_SETTLED_MS);

  await expectNoPreviewLeft(page);
});

test.describe("a back gesture the page keeps for itself", () => {
  const shelf = new FakeShelf([{ state: "notStarted" }]);

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => fakeAppInfo("android"),
      seriesOverview: (id) => shelf.backend().seriesOverview(id),
      seriesBooks: (id, listing, after) =>
        shelf.backend().seriesBooks(id, listing, after),
      keepsDetailEdits: () => true,
      seriesDetails: () => SERIES_DETAILS,
      editSeriesDetails: () => null,
      watchBackSwipes: (channel) => {
        gestures = channel;
        return null;
      },
    },
  });

  test("shows no edit page behind a series that the edit page was closed into", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "Edit details opens as a dialog on a wide screen",
    );
    await page.goto(`/series/${SERIES_ID}/edit`);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL(`/series/${SERIES_ID}`);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1 }),
    ).toHaveText(SERIES_TITLE);

    await gesture(start());
    await gesture(swipe(0.5));

    await expect(page.locator("[data-previous-screen]")).toBeVisible();
    await expect(page.locator("[data-previous-screen] h1")).toHaveCount(0);
  });

  test("lets no page leave when the page keeps a finished back gesture for itself", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "Edit details opens as a dialog on a wide screen",
    );
    await page.goto(`/series/${SERIES_ID}`);
    await page
      .getByRole("button", { name: `More for ${SERIES_TITLE}`, exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Edit details…" }).click();
    await page
      .getByRole("main")
      .getByRole("textbox", { name: "Title" })
      .fill(EDITED_TITLE);
    await pauseTheClock(page);
    await gesture(start());
    await gesture(swipe(0.6));

    await page.goBack();
    await page.clock.runFor(SPRING_BACK_SETTLED_MS);

    await expect(
      page.getByRole("alertdialog", { name: "Discard your changes?" }),
    ).toBeVisible();
    await expectNoPreviewLeft(page);
  });
});

test.describe("going back to a list scrolled down", () => {
  test.use({
    backend: {
      ...sampleLibraryOn("android"),
      watchBackSwipes: (channel) => {
        gestures = channel;
        return null;
      },
    },
  });

  function scrollTopOf(page: Page): Promise<number> {
    return page.getByRole("main").evaluate((main) => main.scrollTop);
  }

  function scrollTopBehind(page: Page): Promise<number> {
    return page
      .locator("[data-previous-screen] > div > .contents > *")
      .evaluate((copy) => copy.scrollTop);
  }

  async function scrollListDown(
    page: Page,
    down: number = SERIES_DOWN,
  ): Promise<number> {
    await expect
      .poll(() =>
        page.getByRole("main").evaluate((main, top) => {
          main.scrollTo({ top });
          return main.scrollTop;
        }, down),
      )
      .toBeGreaterThanOrEqual(down - SCROLL_SLACK_PX);
    return scrollTopOf(page);
  }

  async function clickInPlace(link: Locator): Promise<void> {
    await link.evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click();
      }
    });
  }

  async function openSeriesInView(page: Page): Promise<void> {
    await page.getByRole("main").evaluate((main) => {
      const shown = main.getBoundingClientRect();
      const link = [
        ...main.querySelectorAll<HTMLAnchorElement>("a[href^='/series/']"),
      ].find((candidate) => {
        const box = candidate.getBoundingClientRect();
        return (
          box.top > shown.top + shown.height / 3 && box.bottom < shown.bottom
        );
      });
      if (link === undefined) {
        throw new Error("no series in view");
      }
      link.click();
    });
  }

  async function openCreatorFromSeries(page: Page): Promise<void> {
    await openInApp(page, CREDITED_SERIES);
    await clickInPlace(
      page.getByRole("main").locator("a[href^='/creator/']").first(),
    );
    await expect(page).toHaveURL(/\/creator\//);
  }

  async function headingOf(page: Page): Promise<string> {
    const heading = page.getByRole("main").locator("h1").first();
    await expect(heading).toBeVisible();
    return ((await heading.textContent()) ?? "").trim();
  }

  interface LinkInView {
    readonly href: string;
    readonly offset: number;
  }

  function firstLinkInView(page: Page): Promise<LinkInView | undefined> {
    return page.getByRole("main").evaluate((main) => {
      const shown = main.getBoundingClientRect();
      const isPinned = (link: Element): boolean => {
        for (
          let at: Element | null = link;
          at !== null && at !== main;
          at = at.parentElement
        ) {
          if (["sticky", "fixed"].includes(getComputedStyle(at).position)) {
            return true;
          }
        }
        return false;
      };
      const link = [...main.querySelectorAll("a[href]")].find((candidate) => {
        const box = candidate.getBoundingClientRect();
        return (
          box.height > 0 &&
          box.top >= shown.top &&
          box.bottom <= shown.bottom &&
          !isPinned(candidate)
        );
      });
      return link === undefined
        ? undefined
        : {
            href: link.getAttribute("href") ?? "",
            offset: link.getBoundingClientRect().top - shown.top,
          };
    });
  }

  function offsetOfLink(page: Page, href: string): Promise<number> {
    return page.getByRole("main").evaluate((main, wanted) => {
      const shown = main.getBoundingClientRect();
      const offsets = [...main.querySelectorAll("a[href]")]
        .filter((link) => link.getAttribute("href") === wanted)
        .map((link) => link.getBoundingClientRect().top - shown.top);
      return offsets.reduce(
        (nearest, offset) =>
          Math.abs(offset) < Math.abs(nearest) ? offset : nearest,
        Number.POSITIVE_INFINITY,
      );
    }, href);
  }

  test("shows no Library behind once the library has changed since it was left", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(LIBRARY);
    await headingOf(page);
    await scrollListDown(page, LIBRARY_DOWN);
    await openSeriesInView(page);
    await expect(page).not.toHaveURL(LIBRARY);
    await headingOf(page);

    await emitFakeEvent(page, "library-changed");
    await gesture(start());
    await gesture(swipe(0.5));

    await expect(page.locator("[data-previous-screen]")).toBeVisible();
    await expect(page.locator("[data-previous-screen] h1")).toHaveCount(0);
  });

  for (const way of [
    { path: "a series", open: openSeriesInView },
    {
      path: "a volume",
      open: (page: Page) => openInApp(page, VOLUME_PAGE),
    },
    {
      path: "History and on to a series",
      open: async (page: Page) => {
        await openInApp(page, "/history");
        await openInApp(page, VOLUMES_SERIES);
      },
    },
    {
      path: "search results and on to a series",
      open: async (page: Page) => {
        await openInApp(page, SEARCH);
        await openInApp(page, VOLUMES_SERIES);
      },
    },
    { path: "a series and on to a creator", open: openCreatorFromSeries },
  ]) {
    test(`shows the Library behind, where it was left, going back from ${way.path} opened from it`, async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await page.goto(LIBRARY);
      const heading = await headingOf(page);
      const leftAt = await scrollListDown(page, LIBRARY_DOWN);
      const shownLink = await firstLinkInView(page);
      await way.open(page);
      await expect(page).not.toHaveURL(LIBRARY);
      await pauseTheClock(page);
      await gesture(start());
      await gesture(swipe(0.6));
      await expect(
        page.locator("[data-previous-screen] h1").first(),
      ).toHaveText(heading);
      await expect.poll(() => scrollTopBehind(page)).toBe(leftAt);

      await page.goBack();

      await expect(page).toHaveURL(LIBRARY);
      await page.clock.runFor(COMMIT_PLAYED_MS);
      await expectNoPreviewLeft(page);
      await page.clock.resume();
      expect(shownLink).toBeDefined();
      await expect
        .poll(async () =>
          Math.abs(
            (await offsetOfLink(page, shownLink?.href ?? "")) -
              (shownLink?.offset ?? 0),
          ),
        )
        .toBeLessThanOrEqual(SCROLL_SLACK_PX);
    });
  }
});

test.describe("going back to a page that takes a while to load", () => {
  const reads = {
    isHolding: false,
    waiting: [] as PromiseWithResolvers<undefined>[],
  };

  async function answerOnceReleased(): Promise<void> {
    if (!reads.isHolding) {
      return;
    }
    const answer = Promise.withResolvers<undefined>();
    reads.waiting.push(answer);
    await answer.promise;
  }

  function releaseReads(): void {
    reads.isHolding = false;
    for (const answer of reads.waiting.splice(0)) {
      answer.resolve(undefined);
    }
  }

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => fakeAppInfo("android"),
      libraryFolders: async () => {
        await answerOnceReleased();
        return { folders: [], next: null };
      },
      watchBackSwipes: (channel) => {
        gestures = channel;
        return null;
      },
    },
  });

  test.beforeEach(() => {
    releaseReads();
  });

  test("keeps the page and the page behind as the gesture left them until the page behind arrives, then plays the whole leave", async ({
    page,
  }) => {
    await openPrivacyFromSettings(page);
    await openInApp(page, PERMISSIONS);
    await pauseTheClock(page);
    await gesture(start());
    await gesture(swipe(0.6));
    const leftByTheGesture = await placementOf(page);
    reads.isHolding = true;

    await page.goBack();

    await expect.poll(() => reads.waiting.length).toBeGreaterThan(0);
    expect(await placementOf(page)).toEqual(leftByTheGesture);
    await expect(page.locator("[data-previous-screen]")).toBeVisible();
    await expect(page.locator("[data-leaving-screen]")).toHaveCount(0);

    releaseReads();
    await expect(page.locator("[data-leaving-screen]")).toBeAttached();
    await page.clock.runFor(BEFORE_THE_COMMIT_ENDS_MS);
    await expect(page.locator("[data-leaving-screen]")).toBeAttached();
    await page.clock.runFor(PAST_THE_COMMIT_MS);
    await expectNoPreviewLeft(page);
  });

  test("shows the page before the one being gone back to behind a gesture that starts while it loads", async ({
    page,
  }) => {
    await openPrivacyFromSettings(page);
    await openInApp(page, PERMISSIONS);
    await pauseTheClock(page);
    await gesture(start());
    await gesture(swipe(0.6));
    reads.isHolding = true;
    await page.goBack();
    await expect.poll(() => reads.waiting.length).toBeGreaterThan(0);

    await gesture(start());
    await gesture(swipe(0.3));

    await expect(page.locator("[data-previous-screen] h1").first()).toHaveText(
      SETTINGS_TITLE,
    );
  });

  test("follows a gesture that starts while the page behind loads, and plays no leave for the first one", async ({
    page,
  }) => {
    await openPrivacyFromSettings(page);
    await openInApp(page, PERMISSIONS);
    await pauseTheClock(page);
    await gesture(start());
    await gesture(swipe(0.6));
    reads.isHolding = true;
    await page.goBack();
    await expect.poll(() => reads.waiting.length).toBeGreaterThan(0);
    await gesture(start());
    await gesture(swipe(0.3));
    const placedBySecond = await placementOf(page);

    releaseReads();

    await expect(
      page.getByRole("main").getByRole("heading", { level: 1 }),
    ).toHaveText(PRIVACY_TITLE);
    await expect(page.locator("[data-leaving-screen]")).toHaveCount(0);
    expect(await placementOf(page)).toEqual(placedBySecond);
  });
});
