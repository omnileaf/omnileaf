import type { Locator, Page } from "@playwright/test";

import type { MissingFolder, SeriesBook } from "../../src/lib/ipc/bindings.ts";

import {
  sampleBookId,
  sampleSeriesId,
} from "../../src/lib/sample-library/sample-library.ts";
import {
  accessibilityViolations,
  boxOf,
  expect,
  framesPassed,
  LARGEST_TEXT_SCALE,
  setTextScale,
  sidewaysOverflow,
  test,
} from "./fixtures.ts";
import {
  CommandFailure,
  emitFakeEvent,
  type FakeBackend,
} from "./fake-backend.ts";
import { sampleLibraryOn, serveSampleArt } from "./screens.ts";
import { textClippedUnmarked } from "./text-fit.ts";

const SERIES = sampleSeriesId(21);
const SERIES_TITLE = "Sample Series 21";
const VOLUME_PAGE = `/series/${SERIES}/volume/2`;
const SERIES_FOLDER = "Sample Comics";
const CHAPTER_SEVEN = "Volume 2 · Chapter 7";
const LIBRARY_CHANGED = "library-changed";

async function startPickingFrom(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: `More for ${title}` }).click();
  await page
    .getByRole("dialog", { name: title })
    .getByRole("button", { name: "Select", exact: true })
    .click();
}

interface HeldReads {
  isHolding: boolean;
  readonly waiting: PromiseWithResolvers<undefined>[];
}

interface VolumeReads extends HeldReads {
  isGone: boolean;
}

interface SeriesReads {
  readonly volume: VolumeReads;
  readonly overview: HeldReads;
}

function answeredReads(): SeriesReads {
  return {
    volume: { isHolding: false, isGone: false, waiting: [] },
    overview: { isHolding: false, waiting: [] },
  };
}

let seriesReads = answeredReads();

async function answerOnceReleased(reads: HeldReads): Promise<void> {
  if (!reads.isHolding) {
    return;
  }
  const answer = Promise.withResolvers<undefined>();
  reads.waiting.push(answer);
  await answer.promise;
}

function releaseEvery(reads: HeldReads): void {
  reads.isHolding = false;
  for (const answer of reads.waiting.splice(0)) {
    answer.resolve(undefined);
  }
}

function backendWithHeldReads(): FakeBackend {
  const sample = sampleLibraryOn("android");
  return {
    ...sample,
    seriesVolume: async (series, volume) => {
      await answerOnceReleased(seriesReads.volume);
      return seriesReads.volume.isGone
        ? null
        : sample.seriesVolume(series, volume);
    },
    seriesOverview: async (series) => {
      await answerOnceReleased(seriesReads.overview);
      return sample.seriesOverview(series);
    },
  };
}

async function openInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((href) => {
    const link = document.createElement("a");
    link.href = href;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
}

async function topOf(region: Locator): Promise<number> {
  const box = await region.boundingBox();
  if (box === null) {
    throw new Error("the region isn't drawn");
  }
  return box.y;
}

function chapterRows(page: Page): Locator {
  return page.getByRole("list", { name: "Books" }).getByRole("listitem");
}

test.use({ backend: sampleLibraryOn("android") });

test.describe("A volume's page on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(async ({ page, platform }) => {
    test.skip(platform !== "android", "Android phones' volume page");
    await serveSampleArt(page);
  });

  test("names the volume, its series, its chapters and pages, and its folder", async ({
    page,
  }) => {
    await page.goto(VOLUME_PAGE);
    const about = page.getByRole("region", { name: "About this volume" });

    await expect(
      about.getByRole("heading", { level: 1, name: "Volume 2" }),
    ).toBeVisible();
    await expect(
      about.getByRole("link", { name: SERIES_TITLE }),
    ).toHaveAttribute("href", `/series/${SERIES}`);
    await expect(
      about.getByText("Volume · 4 chapters · 112 pages"),
    ).toBeVisible();
    await expect(
      about.getByText("Sample Comics › Volume 02", { exact: true }),
    ).toBeVisible();
  });

  test("lists the volume's chapters in order under a note that they're in its folder", async ({
    page,
  }) => {
    await page.goto(VOLUME_PAGE);
    const chapters = page.getByRole("region", { name: "4 chapters" });

    await expect(chapters.getByText("In this volume’s folder")).toBeVisible();
    await expect(
      chapters.getByRole("list", { name: "Books" }).getByRole("link"),
    ).toHaveText([/Chapter 5/, /Chapter 6/, /Chapter 7/, /Chapter 8/]);
  });

  test("continues the chapter started in the volume and counts its chapters read", async ({
    page,
  }) => {
    await page.goto(VOLUME_PAGE);
    const card = page.getByRole("region", { name: "Continue", exact: true });

    await expect(
      card.getByText("Volume 2 · Chapter 6, page 11 of 28", { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByText("1 of 4 chapters read", { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole("link", {
        name: "Continue Volume 2 · Chapter 6 at page 11",
      }),
    ).toHaveAttribute("href", `/read/${sampleBookId(21, 6)}`);
  });

  test("puts Continue between the volume's hero and its chapters", async ({
    page,
  }) => {
    await page.goto(VOLUME_PAGE);

    const tops = await Promise.all(
      [
        page.getByRole("region", { name: "About this volume" }),
        page.getByRole("region", { name: "Continue", exact: true }),
        page.getByRole("region", { name: "4 chapters" }),
      ].map(topOf),
    );

    expect(tops).toEqual(tops.toSorted((above, below) => above - below));
    expect(new Set(tops).size).toBe(tops.length);
  });

  test("says every chapter in a read volume is read, with nothing to continue", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES}/volume/1`);
    const card = page.getByRole("region", {
      name: "You’ve read every chapter in this volume",
    });

    await expect(
      card.getByText("New chapters in its folder show up here.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      card.getByText("4 of 4 chapters read", { exact: true }),
    ).toBeVisible();
    await expect(card.getByRole("link")).toHaveCount(0);
  });

  test("goes back to its series", async ({ page }) => {
    await page.goto(VOLUME_PAGE);

    await page
      .getByRole("link", { name: `Back to ${SERIES_TITLE}`, exact: true })
      .click();

    await expect(page).toHaveURL(`/series/${SERIES}`);
    await expect(
      page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
    ).toBeVisible();
  });

  test("leaves out the Show choices above its chapters", async ({ page }) => {
    await page.goto(VOLUME_PAGE);

    await expect(chapterRows(page)).toHaveCount(4);
    await expect(page.getByRole("radiogroup", { name: "Show" })).toHaveCount(0);
  });

  test("finds a chapter in the volume", async ({ page }) => {
    await page.goto(VOLUME_PAGE);

    await page.getByRole("button", { name: "Find a book" }).click();
    await page
      .getByRole("searchbox", { name: "Find a book" })
      .fill("Chapter 7");

    await expect(chapterRows(page)).toHaveText([/Chapter 7/]);
  });

  test.describe("with chapters marked", () => {
    test.use({ backend: sampleLibraryOn("android") });

    test("keeps its chapter list in place while a marked chapter turns read", async ({
      page,
    }) => {
      await page.goto(VOLUME_PAGE);
      const list = await page
        .getByRole("list", { name: "Books" })
        .elementHandle();
      await startPickingFrom(page, CHAPTER_SEVEN);

      await page
        .getByRole("group", { name: "Selected books" })
        .getByRole("button", { name: "Mark read" })
        .click();

      await expect(
        chapterRows(page).filter({ hasText: CHAPTER_SEVEN }),
      ).toContainText("Read");
      expect(await list.evaluate((shown) => shown.isConnected)).toBe(true);
    });
  });

  test.describe("with chapters removed", () => {
    test.use({ backend: sampleLibraryOn("android") });

    test("goes back to its series once every chapter in it is removed, still leading up to the library", async ({
      page,
    }) => {
      await page.goto(VOLUME_PAGE);
      await startPickingFrom(page, CHAPTER_SEVEN);
      await page.getByRole("button", { name: "Select all" }).click();

      await page
        .getByRole("group", { name: "Selected books" })
        .getByRole("button", { name: "Delete" })
        .click();
      await page
        .getByRole("alertdialog", { name: "Remove from your library?" })
        .getByRole("button", { name: "Remove" })
        .click();

      await expect(page).toHaveURL(`/series/${SERIES}`);
      await expect(
        page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "Back to the library", exact: true })
        .click();
      await expect(page).toHaveURL("/");
    });
  });

  test.describe("with the volume gone while the series opens", () => {
    test.use({ backend: backendWithHeldReads() });

    test.beforeEach(() => {
      seriesReads = answeredReads();
    });

    test("goes back to its series once, however often it hears the library changed on the way", async ({
      page,
    }) => {
      await page.goto("/");
      await openInApp(page, `/series/${SERIES}`);
      await expect(
        page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
      ).toBeVisible();
      await openInApp(page, VOLUME_PAGE);
      await expect(
        page.getByRole("heading", { level: 1, name: "Volume 2" }),
      ).toBeVisible();
      seriesReads.volume.isGone = true;
      seriesReads.volume.isHolding = true;
      seriesReads.overview.isHolding = true;
      await emitFakeEvent(page, LIBRARY_CHANGED);
      await emitFakeEvent(page, LIBRARY_CHANGED);
      await expect.poll(() => seriesReads.volume.waiting.length).toBe(2);

      seriesReads.volume.waiting.shift()?.resolve(undefined);
      await page.waitForURL(`**/series/${SERIES}`);
      releaseEvery(seriesReads.volume);
      await framesPassed(page);
      releaseEvery(seriesReads.overview);

      await expect(
        page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
      ).toBeVisible();
      await expect(page).toHaveURL(`/series/${SERIES}`);
      await page
        .getByRole("link", { name: "Back to the library", exact: true })
        .click();
      await expect(page).toHaveURL("/");
    });
  });

  test("shows stand-ins for its series, cover, folder and chapters with Screenshot mode on", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({ activity: { kind: "on" } }),
      );
    });

    await page.goto(VOLUME_PAGE);
    await expect(chapterRows(page)).toHaveCount(4);

    const shown = (await page.getByRole("main").textContent()) ?? "";
    for (const own of [SERIES_TITLE, SERIES_FOLDER, "Volume 2 · Chapter"]) {
      expect(shown).not.toContain(own);
    }
    await expect(page.locator("main img")).toHaveCount(0);
  });

  for (const { name, path } of [
    {
      name: "a volume the series doesn't have",
      path: `/series/${SERIES}/volume/3`,
    },
    {
      name: "a volume that isn't a number",
      path: `/series/${SERIES}/volume/two`,
    },
    {
      name: "a series not in the library",
      path: `/series/${sampleSeriesId(999)}/volume/2`,
    },
  ]) {
    test(`says ${name} isn't there`, async ({ page }) => {
      await page.goto(path);

      await expect(
        page.getByRole("heading", { name: "This page doesn't exist" }),
      ).toBeVisible();
    });
  }

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(VOLUME_PAGE);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }

  test("fits the largest text without spilling or cutting words off", async ({
    page,
  }) => {
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await page.goto(VOLUME_PAGE);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    expect(await sidewaysOverflow(page, "body")).toEqual([]);
    expect(await textClippedUnmarked(page)).toEqual([]);
  });
});

function volumeTiles(page: Page): Locator {
  return page.getByRole("list", { name: "Volumes" }).getByRole("link");
}

test.describe(
  "A volume of chapters on its series' page on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(async ({ page, platform }) => {
      test.skip(platform !== "android", "Android phones' volume tiles");
      await serveSampleArt(page);
    });

    test("shows each volume of chapters as one tile saying how much of it is read", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES}`);

      await expect(volumeTiles(page)).toHaveText([
        /^\s*Volume 1\s*Read\s*$/,
        /^\s*Volume 2\s*1 of 4 chapters read\s*$/,
      ]);
      await expect(
        volumeTiles(page).first().locator("[data-read-mark]"),
      ).toHaveCount(1);
    });

    test("draws a bar under a volume in progress, filled to its chapters read, across the tile", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES}`);
      const second = volumeTiles(page).filter({ hasText: "Volume 2" });
      const bar = second.locator("[role=progressbar]");

      await expect(bar).toHaveAttribute("aria-valuenow", "1");
      await expect(bar).toHaveAttribute("aria-valuemax", "4");
      expect((await boxOf(bar)).width).toBe((await boxOf(second)).width);
      await expect(
        volumeTiles(page).first().locator("[role=progressbar]"),
      ).toHaveCount(0);
    });

    test("opens a volume's page from its tile, and Back comes back to the volumes", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES}`);

      await volumeTiles(page).filter({ hasText: "Volume 2" }).click();

      await expect(page).toHaveURL(VOLUME_PAGE);
      await page
        .getByRole("link", { name: `Back to ${SERIES_TITLE}`, exact: true })
        .click();
      await expect(page).toHaveURL(`/series/${SERIES}`);
      await expect(volumeTiles(page)).toHaveCount(2);
    });

    test("picks every chapter in a volume when its tile is picked, and marks them all", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES}`);
      const second = volumeTiles(page).filter({ hasText: "Volume 2" });
      await second.focus();
      await page.keyboard.press("Space");
      const picked = page.getByRole("group", { name: "Selected books" });

      await expect(picked).toContainText("4 books");
      await picked.getByRole("button", { name: "Mark read" }).click();

      await expect(volumeTiles(page)).toHaveText([
        /^\s*Volume 1\s*Read\s*$/,
        /^\s*Volume 2\s*Read\s*$/,
      ]);
    });
  },
);

const AWAY_FOLDER: MissingFolder = {
  folder: {
    id: "0190a3e4-0000-7000-8000-0000000000f1" as MissingFolder["folder"]["id"],
    kind: "linked",
    name: "Comics",
    location: "/storage/1A2B-3C4D/Comics",
    isAvailable: false,
  },
  problem: { kind: "driveDisconnected" },
  hiddenSeries: 0,
  isShownAnyway: true,
};

let askedAway: string[] = [];

function awayBook<Book extends { file: SeriesBook["file"] }>(book: Book): Book {
  return { ...book, file: { kind: "notConnected" } };
}

function awayVolumeBackend(): FakeBackend {
  const sample = sampleLibraryOn("android");
  return {
    ...sample,
    seriesBooks: async (series, listing, after) => {
      const page = await sample.seriesBooks(series, listing, after);
      return { ...page, books: page.books.map(awayBook) };
    },
    seriesVolume: async (series, volume) => {
      const found = await sample.seriesVolume(series, volume);
      return found === null
        ? null
        : {
            ...found,
            upNext: found.upNext === null ? null : awayBook(found.upNext),
          };
    },
    bookMissingFolder: (id) => {
      askedAway.push(`book ${id}`);
      return AWAY_FOLDER;
    },
    relocateLibraryFolder: (id) => {
      askedAway.push(`relocate ${id}`);
      return null;
    },
  };
}

function awayNotice(page: Page, title: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) });
}

test.describe(
  "A volume's page on an Android phone whose chapters aren't connected",
  { tag: "@native" },
  () => {
    test.use({ backend: awayVolumeBackend() });

    test.beforeEach(async ({ page, platform }) => {
      test.skip(platform !== "android", "Android phones' volume page");
      askedAway = [];
      await serveSampleArt(page);
    });

    test("says why instead of opening a chapter that isn't connected", async ({
      page,
    }) => {
      await page.goto(VOLUME_PAGE);

      await chapterRows(page)
        .filter({ hasText: CHAPTER_SEVEN })
        .getByRole("button", { name: new RegExp(`^${CHAPTER_SEVEN}`) })
        .click();

      await expect(
        awayNotice(page, `${CHAPTER_SEVEN} isn’t connected`),
      ).toContainText("It can’t be opened until its folder or drive is back.");
      expect(new URL(page.url()).pathname).toBe(VOLUME_PAGE);
    });

    test("turns Continue into Find the folder for the chapter up next", async ({
      page,
    }) => {
      await page.goto(VOLUME_PAGE);

      await page
        .getByRole("button", {
          name: "Find the folder for Volume 2 · Chapter 6",
        })
        .click();

      await expect
        .poll(() => askedAway)
        .toEqual([
          `book ${sampleBookId(21, 6)}`,
          `relocate ${AWAY_FOLDER.folder.id}`,
        ]);
    });

    test("finds a chapter's folder from its sheet", async ({ page }) => {
      await page.goto(VOLUME_PAGE);
      await page
        .getByRole("button", { name: `More for ${CHAPTER_SEVEN}` })
        .click();

      await page
        .getByRole("dialog", { name: CHAPTER_SEVEN })
        .getByRole("button", { name: "Find the folder" })
        .click();

      await expect
        .poll(() => askedAway)
        .toEqual([
          `book ${sampleBookId(21, 7)}`,
          `relocate ${AWAY_FOLDER.folder.id}`,
        ]);
    });
  },
);

test.describe(
  "A volume's page on an Android phone when the catalog can't be read",
  { tag: "@native" },
  () => {
    const failure = {
      code: "internal",
      message: "the catalog is locked",
    } as const;

    test.use({
      backend: {
        ...sampleLibraryOn("android"),
        seriesVolume: () => {
          throw new CommandFailure(failure);
        },
      },
    });

    test("reports why it couldn't read the volume", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "android", "Android phones' volume page");
      await page.addInitScript(() => {
        const seen: unknown[] = [];
        Object.assign(window, { reportedErrors: seen });
        window.addEventListener("error", (event) => {
          seen.push(event.error);
        });
      });

      await page.goto(VOLUME_PAGE);

      await expect
        .poll(() =>
          page.evaluate((): unknown => Reflect.get(window, "reportedErrors")),
        )
        .toContainEqual(failure);
    });
  },
);
