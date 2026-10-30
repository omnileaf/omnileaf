import type { Locator, Page, Route } from "@playwright/test";

import type { Size } from "../../src/lib/reader/page-fit.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BORDERS_CROPPED,
  CROP_SUFFIXES,
  NOT_STARTED,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  readerBackend,
  readerBook,
  servePages,
  SIDES_CROPPED,
  type WireOpening,
} from "./reader-book.ts";

const CROPS_BORDERS = {
  "omnileaf.readerSettings.all": JSON.stringify({ cropsBorders: true }),
};
const STRIP_WIDTH = 800;
const STRIP_HEIGHT = 2400;
const RATIO_CLOSE = 0.005;
const CLOSE_PX = 4;
const NARROWER = 0.6;
const UNEVENLY_CROPPED_PAGE = 2;
const SHARE_CLOSE = 0.01;
const HALF = 0.5;
const STRADDLING_PAGE = 13;
const READ_PAGE = 14;
const PARTWAY = 0.3;
const SHARE_AFTER_CROP_CLOSE = 0.03;
const ZOOM_STEPS = 5;
const SQUARE_PAGE = { width: PAGE_WIDTH, height: PAGE_WIDTH };
const TWO_PAGES_TO_WIDTH = { layout: "two", fit: "width" };
const STARTED_ON_14: WireOpening = {
  reading: { state: "started", page: 14 },
  startPage: 13,
};

function stripBackend(opening: WireOpening = NOT_STARTED): FakeBackend {
  return {
    ...readerBackend(DEFAULT_BACKEND, opening),
    openBook: () => {
      const book = readerBook(opening);
      return {
        ...book,
        pages: book.pages.map((page) => ({
          ...page,
          size: { width: STRIP_WIDTH, height: STRIP_HEIGHT },
        })),
      };
    },
  };
}

function spreadBackend(thirdPageSize: Size | null): FakeBackend {
  return {
    ...readerBackend(DEFAULT_BACKEND),
    openBook: () => {
      const book = readerBook(NOT_STARTED);
      return {
        ...book,
        pages: book.pages.map((page, index) =>
          index === UNEVENLY_CROPPED_PAGE
            ? { ...page, size: thirdPageSize }
            : page,
        ),
      };
    },
  };
}

async function turnToSecondSpread(page: Page): Promise<void> {
  await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);
  await page.keyboard.press("ArrowRight");
  await expect(shownPage(page, 2)).not.toHaveClass(/invisible/);
}

async function openBook(
  page: Page,
  stored: Record<string, string> = {},
  beforeServing?: (route: Route, index: number) => Promise<void>,
): Promise<void> {
  await page.addInitScript(
    (entries) => {
      localStorage.setItem("omnileaf.readerGuide.leftToRight", "seen");
      localStorage.setItem("omnileaf.readerGuide.strip", "seen");
      localStorage.setItem(`omnileaf.stripFound.${entries.series}`, "seen");
      for (const [key, value] of Object.entries(entries.stored)) {
        localStorage.setItem(key, value);
      }
    },
    { stored, series: BOOK_SERIES_ID },
  );
  await servePages(page, beforeServing);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
}

async function openSettings(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
}

function cropSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: "Crop white borders", exact: true });
}

function shownPage(page: Page, number: number): Locator {
  return page.locator(`img[alt="Page ${String(number)}"]:not([aria-hidden])`);
}

function stripPage(page: Page, number: number): Locator {
  return page
    .locator("[data-strip]")
    .getByRole("img", { name: `Page ${String(number)}`, exact: true });
}

async function ratioOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.width / box.height;
  });
}

async function offsetFromStripTop(page: Page, number: number): Promise<number> {
  const strip = await page.locator("[data-strip]").boundingBox();
  const shown = await stripPage(page, number).boundingBox();
  return Math.abs((shown?.y ?? 0) - (strip?.y ?? Number.NaN));
}

async function shareAboveStripTop(page: Page, number: number): Promise<number> {
  const strip = await page.locator("[data-strip]").boundingBox();
  const shown = await stripPage(page, number).boundingBox();
  return ((strip?.y ?? 0) - (shown?.y ?? 0)) / (shown?.height ?? Number.NaN);
}

async function scrollPartwayInto(
  page: Page,
  number: number,
  share: number,
): Promise<void> {
  await stripPage(page, number).evaluate(async (image, into) => {
    const pageBox = image.parentElement;
    const strip = image.closest("[data-strip]");
    if (pageBox === null || strip === null) {
      return;
    }
    const seen = new Promise<void>((resolve) => {
      strip.addEventListener(
        "scroll",
        () => {
          resolve();
        },
        { once: true },
      );
    });
    const from = strip.scrollTop;
    strip.scrollTop = pageBox.offsetTop + pageBox.offsetHeight * into;
    if (strip.scrollTop !== from) {
      await seen;
    }
  }, share);
}

function pagedScroller(page: Page): Locator {
  return page.locator("[data-shown-page]");
}

async function zoomIntoPage(page: Page, number = 1): Promise<void> {
  await expect(shownPage(page, number)).not.toHaveClass(/invisible/);
  for (let step = 0; step < ZOOM_STEPS; step += 1) {
    await page.keyboard.press("Control+=");
  }
  await page.keyboard.press("m");
  await expect
    .poll(() =>
      pagedScroller(page).evaluate(
        (scroller) => scroller.scrollHeight > scroller.clientHeight,
      ),
    )
    .toBe(true);
}

async function scrollPagePartway(page: Page): Promise<void> {
  await pagedScroller(page).evaluate((scroller, into) => {
    scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * into;
    scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) * into;
  }, PARTWAY);
}

async function sharePagedScrolled(page: Page): Promise<number> {
  return pagedScroller(page).evaluate(
    (scroller) =>
      scroller.scrollTop / (scroller.scrollHeight - scroller.clientHeight),
  );
}

async function pixelsFromPartway(page: Page): Promise<Size> {
  return pagedScroller(page).evaluate(
    (scroller, into) => ({
      width: Math.abs(
        scroller.scrollLeft -
          (scroller.scrollWidth - scroller.clientWidth) * into,
      ),
      height: Math.abs(
        scroller.scrollTop -
          (scroller.scrollHeight - scroller.clientHeight) * into,
      ),
    }),
    PARTWAY,
  );
}

async function hasLoaded(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate(
        (image) => image instanceof HTMLImageElement && image.naturalWidth > 0,
      ),
    )
    .toBe(true);
}

test.describe("the paged reader", () => {
  test.use({ backend: readerBackend(DEFAULT_BACKEND) });

  test("turns Crop white borders on and keeps it on the next time a book opens", async ({
    page,
  }) => {
    await openBook(page);
    await openSettings(page);
    await expect(cropSwitch(page)).toBeEnabled();

    await cropSwitch(page).click();
    await page.reload();
    await openSettings(page);

    await expect(cropSwitch(page)).toBeChecked();
  });

  test("shows each page with its borders cropped once Crop white borders turns on", async ({
    page,
  }) => {
    await openBook(page);
    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0$/);
    await openSettings(page);

    await cropSwitch(page).click();

    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0\/cropped$/);
  });

  test("never draws a page with all its borders cropped in the long strip it switches to", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);
    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0\/cropped$/);
    await page.evaluate(() => {
      new MutationObserver(() => {
        for (const image of document.querySelectorAll("[data-strip] img")) {
          if (image.getAttribute("src")?.endsWith("/cropped") === true) {
            document.documentElement.dataset.stripDrewBorders = "";
          }
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    });
    await openSettings(page);

    await page
      .getByRole("combobox", { name: "Reading mode" })
      .selectOption({ label: "Long strip" });

    await expect(stripPage(page, 1)).toHaveAttribute(
      "src",
      /\/0\/sides-cropped$/,
    );
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-strip-drew-borders",
    );
  });

  test("opens on the page with its borders cropped when Crop white borders is on", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);

    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0\/cropped$/);
    await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);
  });

  test("keeps the same part of a zoomed page in view when Crop white borders turns on", async ({
    page,
  }) => {
    await openBook(page);
    await zoomIntoPage(page);
    await scrollPagePartway(page);
    await openSettings(page);

    await cropSwitch(page).click();

    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0\/cropped$/);
    await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);
    await expect
      .poll(async () => Math.abs((await sharePagedScrolled(page)) - PARTWAY))
      .toBeLessThan(SHARE_CLOSE);
  });

  test("keeps the same part of a zoomed page in view when Crop white borders turns off", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);
    await zoomIntoPage(page);
    await scrollPagePartway(page);
    await openSettings(page);

    await cropSwitch(page).click();

    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0$/);
    await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);
    await expect
      .poll(async () => Math.abs((await sharePagedScrolled(page)) - PARTWAY))
      .toBeLessThan(SHARE_CLOSE);
  });

  test("keeps a page on screen while it switches to the long strip and back with Crop white borders on", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);
    await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);
    await page.evaluate(() => {
      new MutationObserver(() => {
        if (
          document.querySelector("[data-strip] img, [data-shown-page] img") ===
          null
        ) {
          document.documentElement.dataset.readerWentBlank = "";
        }
      }).observe(document.body, { subtree: true, childList: true });
    });
    await openSettings(page);
    const mode = page.getByRole("combobox", { name: "Reading mode" });

    await mode.selectOption({ label: "Long strip" });
    await expect(stripPage(page, 1)).toHaveAttribute(
      "src",
      /\/0\/sides-cropped$/,
    );
    await mode.selectOption({ label: "Left to right" });

    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0\/cropped$/);
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-reader-went-blank",
    );
  });

  test("sizes a cropped page to the cropped image instead of the whole page", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);
    await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);

    const ratio = await ratioOf(shownPage(page, 1));

    expect(
      Math.abs(ratio - BORDERS_CROPPED.width / BORDERS_CROPPED.height),
    ).toBeLessThan(RATIO_CLOSE);
    expect(Math.abs(ratio - PAGE_WIDTH / PAGE_HEIGHT)).toBeGreaterThan(
      RATIO_CLOSE,
    );
  });
});

test.describe("a two-page spread cropped by different amounts", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      croppedPagePaths: (paths) =>
        paths.map((path, index) =>
          index === UNEVENLY_CROPPED_PAGE
            ? `${path}/sides-cropped`
            : `${path}/cropped`,
        ),
    },
  });

  test("shows both pages at one height", async ({ page }) => {
    await openBook(page, {
      "omnileaf.readerSettings.all": JSON.stringify({
        cropsBorders: true,
        layout: "two",
        fit: "width",
      }),
    });
    await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);

    await page.keyboard.press("ArrowRight");

    await expect(shownPage(page, 2)).not.toHaveClass(/invisible/);
    await expect(shownPage(page, 3)).not.toHaveClass(/invisible/);
    const left = await shownPage(page, 2).boundingBox();
    const right = await shownPage(page, 3).boundingBox();
    expect(
      Math.abs((left?.height ?? 0) - (right?.height ?? Number.NaN)),
    ).toBeLessThan(CLOSE_PX);
  });

  test("keeps the same part of a zoomed spread in view once both pages load cropped", async ({
    page,
  }) => {
    let release = (): void => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openBook(
      page,
      { "omnileaf.readerSettings.all": JSON.stringify(TWO_PAGES_TO_WIDTH) },
      async (route, index) => {
        if (
          index === UNEVENLY_CROPPED_PAGE &&
          route.request().url().endsWith(CROP_SUFFIXES.sideBorders)
        ) {
          await released;
        }
      },
    );
    await turnToSecondSpread(page);
    await zoomIntoPage(page, 2);
    await openSettings(page);
    await scrollPagePartway(page);

    await cropSwitch(page).click();
    await expect(shownPage(page, 2)).toHaveAttribute("src", /\/1\/cropped$/);
    await expect(shownPage(page, 2)).not.toHaveClass(/invisible/);
    release();

    await expect(shownPage(page, 3)).not.toHaveClass(/invisible/);
    await expect
      .poll(async () => (await pixelsFromPartway(page)).height)
      .toBeLessThan(CLOSE_PX);
    await expect
      .poll(async () => (await pixelsFromPartway(page)).width)
      .toBeLessThan(CLOSE_PX);
  });
});

test.describe("a two-page spread of differently shaped pages with Crop white borders off", () => {
  test.use({ backend: spreadBackend(SQUARE_PAGE) });

  test("fits each page to its own half of the screen", async ({ page }) => {
    await openBook(page, {
      "omnileaf.readerSettings.all": JSON.stringify(TWO_PAGES_TO_WIDTH),
    });

    await turnToSecondSpread(page);

    await expect(shownPage(page, 3)).not.toHaveClass(/invisible/);
    const left = await shownPage(page, 2).boundingBox();
    const right = await shownPage(page, 3).boundingBox();
    expect(
      Math.abs((left?.width ?? 0) - (right?.width ?? Number.NaN)),
    ).toBeLessThan(CLOSE_PX);
  });
});

test.describe("a two-page spread with a page of unknown size", () => {
  test.use({ backend: spreadBackend(null) });

  test("still sizes the cropped page beside it to its image", async ({
    page,
  }) => {
    await openBook(
      page,
      {
        "omnileaf.readerSettings.all": JSON.stringify({
          ...TWO_PAGES_TO_WIDTH,
          cropsBorders: true,
        }),
      },
      async (_route, index) => {
        if (index === UNEVENLY_CROPPED_PAGE) {
          await new Promise(() => {});
        }
      },
    );

    await turnToSecondSpread(page);

    expect(
      Math.abs(
        (await ratioOf(shownPage(page, 2))) -
          BORDERS_CROPPED.width / BORDERS_CROPPED.height,
      ),
    ).toBeLessThan(RATIO_CLOSE);
  });
});

test.describe("when the core can't crop the pages", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      croppedPagePaths: () => {
        throw new CommandFailure({
          code: "internal",
          message: "read a page path the library didn't give out",
        });
      },
    },
  });

  test("shows the whole page instead", async ({ page }) => {
    await openBook(page, CROPS_BORDERS);

    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0$/);
    await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);
  });
});

test.describe("the long strip", () => {
  test.use({ backend: stripBackend() });

  test("crops only the sides of each page, by one amount for the book", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);

    await expect(stripPage(page, 1)).toHaveAttribute(
      "src",
      /\/0\/sides-cropped$/,
    );
  });

  test("sizes a cropped page to the cropped image instead of the whole page", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);
    await hasLoaded(stripPage(page, 1));

    await expect
      .poll(async () =>
        Math.abs(
          (await ratioOf(stripPage(page, 1))) -
            SIDES_CROPPED.width / SIDES_CROPPED.height,
        ),
      )
      .toBeLessThan(RATIO_CLOSE);
  });
});

test.describe("the long strip opened partway", () => {
  test.use({ backend: stripBackend(STARTED_ON_14) });

  test("keeps the page being read in place when the strip narrows with Crop white borders off", async ({
    page,
  }) => {
    await openBook(page);
    await hasLoaded(stripPage(page, 14));
    const viewport = page.viewportSize();

    await page.setViewportSize({
      width: Math.round((viewport?.width ?? 0) * NARROWER),
      height: viewport?.height ?? 0,
    });

    await expect
      .poll(() => offsetFromStripTop(page, 14))
      .toBeLessThan(CLOSE_PX);
  });

  test("holds the page being read still while a cropped page above it loads", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);
    await hasLoaded(stripPage(page, 14));

    await hasLoaded(stripPage(page, 13));

    await expect
      .poll(() => offsetFromStripTop(page, 14))
      .toBeLessThan(CLOSE_PX);
    expect(
      Math.abs(
        (await ratioOf(stripPage(page, 13))) -
          SIDES_CROPPED.width / SIDES_CROPPED.height,
      ),
    ).toBeLessThan(RATIO_CLOSE);
  });

  test("keeps the same part of a page at the top while that page loads cropped across the top edge", async ({
    page,
  }) => {
    let release = (): void => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openBook(page, CROPS_BORDERS, async (_route, index) => {
      if (index === STRADDLING_PAGE - 1) {
        await released;
      }
    });
    await hasLoaded(stripPage(page, 14));
    await scrollPartwayInto(page, STRADDLING_PAGE, HALF);
    const share = await shareAboveStripTop(page, STRADDLING_PAGE);

    release();

    await hasLoaded(stripPage(page, STRADDLING_PAGE));
    await expect
      .poll(async () =>
        Math.abs(
          (await ratioOf(stripPage(page, STRADDLING_PAGE))) -
            SIDES_CROPPED.width / SIDES_CROPPED.height,
        ),
      )
      .toBeLessThan(RATIO_CLOSE);
    expect(
      Math.abs((await shareAboveStripTop(page, STRADDLING_PAGE)) - share),
    ).toBeLessThan(SHARE_CLOSE);
  });

  test("keeps the same part of the page being read at the top when the strip narrows with Crop white borders on", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);
    await hasLoaded(stripPage(page, READ_PAGE));
    await hasLoaded(stripPage(page, READ_PAGE - 1));
    await scrollPartwayInto(page, READ_PAGE, PARTWAY);
    const share = await shareAboveStripTop(page, READ_PAGE);
    const viewport = page.viewportSize();

    await page.setViewportSize({
      width: Math.round((viewport?.width ?? 0) * NARROWER),
      height: viewport?.height ?? 0,
    });

    await expect
      .poll(async () =>
        Math.abs((await shareAboveStripTop(page, READ_PAGE)) - share),
      )
      .toBeLessThan(SHARE_CLOSE);
  });

  test("keeps the same part of the page being read at the top when Crop white borders turns on", async ({
    page,
  }) => {
    await openBook(page);
    await hasLoaded(stripPage(page, READ_PAGE));
    await openSettings(page);
    await scrollPartwayInto(page, READ_PAGE, PARTWAY);
    const share = await shareAboveStripTop(page, READ_PAGE);

    await cropSwitch(page).click();

    await expect(stripPage(page, READ_PAGE)).toHaveAttribute(
      "src",
      /\/sides-cropped$/,
    );
    await hasLoaded(stripPage(page, READ_PAGE));
    await expect
      .poll(async () =>
        Math.abs((await shareAboveStripTop(page, READ_PAGE)) - share),
      )
      .toBeLessThan(SHARE_AFTER_CROP_CLOSE);
  });

  test("keeps the same part of the page being read at the top when Crop white borders turns off", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);
    await hasLoaded(stripPage(page, READ_PAGE));
    await hasLoaded(stripPage(page, READ_PAGE - 1));
    await openSettings(page);
    await scrollPartwayInto(page, READ_PAGE, PARTWAY);
    const share = await shareAboveStripTop(page, READ_PAGE);

    await cropSwitch(page).click();

    await expect(stripPage(page, READ_PAGE)).toHaveAttribute("src", /\/13$/);
    await hasLoaded(stripPage(page, READ_PAGE));
    await expect
      .poll(async () =>
        Math.abs((await shareAboveStripTop(page, READ_PAGE)) - share),
      )
      .toBeLessThan(SHARE_AFTER_CROP_CLOSE);
  });
});
