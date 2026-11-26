import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, settle, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  PAGE_COUNT,
  pageDrawnAtRest,
  pinchTo,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const LOOK_KEY = "omnileaf.readerSettings.all";
const GUIDES_SEEN = [
  "omnileaf.readerGuide.leftToRight",
  "omnileaf.readerGuide.rightToLeft",
];
const ANIMATIONS_STILL_KEY = "omnileaf.animationsStill";
const DRAG_PX = 100;
const SHORT_DRAG_PX = 30;
const CLOSE_PX = 4;
const TURN_SHARES = [0, 0.25, 0.5, 0.75, 1] as const;
const MID_TURN = [0.5] as const;
const AT_REST = [0] as const;
const COVER_SAMPLES = 20;
const SLOW_SLIDE_MS = 100_000;
const SLIDE_MS = 350;
const QUICK_TURN_MS = 50;
const SMALL_MOVE_PX = 6;
const NEVER_ARRIVING_PAGE = 16;
const TAPPED_ACROSS = 0.75;
const TAPPED_DOWN = 0.4;
const OPENING = {
  reading: { state: "started", page: 14 },
  startPage: 13,
} as const;
const RIGHT = 1;
const LEFT = -1;

type Side = typeof RIGHT | typeof LEFT;

test.use({ backend: readerBackend(DEFAULT_BACKEND, OPENING) });

interface Opening {
  readonly stored?: Record<string, string>;
  readonly pageArrives?: (index: number) => Promise<void>;
}

async function openBookWith(
  page: Page,
  look: object,
  { stored = {}, pageArrives }: Opening = {},
): Promise<void> {
  await page.addInitScript(
    ({ key, value, guides, entries }) => {
      localStorage.setItem(key, value);
      for (const guide of guides) {
        localStorage.setItem(guide, "seen");
      }
      for (const [entry, setting] of Object.entries(entries)) {
        localStorage.setItem(entry, setting);
      }
    },
    {
      key: LOOK_KEY,
      value: JSON.stringify(look),
      guides: GUIDES_SEEN,
      entries: stored,
    },
  );
  await servePages(
    page,
    pageArrives === undefined ? undefined : (_, index) => pageArrives(index),
  );
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
  await expect(shownPage(page, 14)).toBeVisible();
}

function shownPage(page: Page, number: number): Locator {
  return page
    .getByRole("main")
    .getByRole("img", { name: `Page ${String(number)}`, exact: true });
}

function anyPage(page: Page, number: number): Locator {
  return page.getByRole("main").locator(`img[alt="Page ${String(number)}"]`);
}

async function expectDecoded(page: Page, number: number): Promise<void> {
  await expect(anyPage(page, number)).not.toHaveClass(/invisible/);
}

async function pageAreaWidth(page: Page): Promise<number> {
  const box = await page.locator("[data-shown-page]").boundingBox();
  if (box === null) {
    throw new Error("the page area is not on screen");
  }
  return box.width;
}

interface PagePlace {
  readonly x: number;
  readonly isVisible: boolean;
}

interface TurnFrames {
  readonly moving: number;
  readonly frames: readonly (readonly PagePlace[])[];
}

function framesOfTheTurn(
  page: Page,
  numbers: readonly number[],
): Promise<TurnFrames> {
  return page.evaluate(
    ({ pages, shares }) => {
      const moving = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect instanceof KeyframeEffect &&
            animation.effect
              .getKeyframes()
              .some((frame) => "translate" in frame),
        );
      for (const animation of moving) {
        animation.pause();
      }
      const placeOf = (number: number): PagePlace => {
        const image = document.querySelector(
          `main img[alt="Page ${String(number)}"]`,
        );
        return image === null
          ? { x: Number.NaN, isVisible: false }
          : {
              x: image.getBoundingClientRect().x,
              isVisible: getComputedStyle(image).visibility === "visible",
            };
      };
      const frames = shares.map((share) => {
        for (const animation of moving) {
          const duration = Number(animation.effect?.getTiming().duration ?? 0);
          animation.currentTime = share * duration;
        }
        return pages.map(placeOf);
      });
      for (const animation of moving) {
        animation.finish();
      }
      return { moving: moving.length, frames };
    },
    { pages: numbers, shares: TURN_SHARES },
  );
}

interface CellsSeen {
  readonly gaps: number;
  readonly offScreen: number;
}

function cellsOfTheTurn(
  page: Page,
  shares: readonly number[] = TURN_SHARES,
): Promise<CellsSeen[]> {
  return page.evaluate(
    ({ moments, samples }) => {
      const moving = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect instanceof KeyframeEffect &&
            animation.effect
              .getKeyframes()
              .some((frame) => "translate" in frame),
        );
      for (const animation of moving) {
        animation.pause();
      }
      const area = document
        .querySelector("[data-shown-page]")
        ?.getBoundingClientRect();
      if (area === undefined) {
        throw new Error("the page area is not on screen");
      }
      const cells = (): Element[] => [
        ...new Set(
          [...document.querySelectorAll('main img[alt^="Page "]')].flatMap(
            (image) => image.parentElement?.parentElement ?? [],
          ),
        ),
      ];
      const isOnScreen = (box: DOMRect): boolean =>
        box.right > area.left &&
        box.left < area.right &&
        box.bottom > area.top &&
        box.top < area.bottom;
      const seen = moments.map((share) => {
        for (const animation of moving) {
          const duration = Number(animation.effect?.getTiming().duration ?? 0);
          animation.currentTime = share * duration;
        }
        const painted = cells().filter((cell) =>
          cell.checkVisibility({ visibilityProperty: true }),
        );
        const xs = Array.from(
          { length: samples },
          (_, step) => area.left + ((step + 0.5) * area.width) / samples,
        );
        const gaps = xs.filter(
          (x) =>
            !painted.some((cell) => {
              const box = cell.getBoundingClientRect();
              return box.left <= x && x <= box.right;
            }),
        ).length;
        const offScreen = cells().filter(
          (cell) =>
            (cell.checkVisibility({ visibilityProperty: true }) ||
              cell.getAnimations().length > 0) &&
            !isOnScreen(cell.getBoundingClientRect()),
        ).length;
        return { gaps, offScreen };
      });
      for (const animation of moving) {
        animation.finish();
      }
      return seen;
    },
    { moments: shares, samples: COVER_SAMPLES },
  );
}

async function holdSlidesAt(page: Page, share: number): Promise<void> {
  await page.evaluate((held) => {
    for (const animation of document.getAnimations()) {
      animation.pause();
      const duration = Number(animation.effect?.getTiming().duration ?? 0);
      animation.currentTime = held * duration;
    }
  }, share);
}

async function slowSlides(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `:root, :root * { --native-duration-slide: ${String(SLOW_SLIDE_MS)}ms !important; }`,
  });
}

async function finishSlides(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.finish();
    }
  });
}

function expectBeside(
  [shown, other]: readonly PagePlace[],
  side: Side,
  width: number,
): void {
  expect(shown?.isVisible).toBe(true);
  expect(other?.isVisible).toBe(true);
  expect(
    Math.abs(
      (other?.x ?? Number.NaN) - (shown?.x ?? Number.NaN) - side * width,
    ),
  ).toBeLessThan(CLOSE_PX);
}

function expectNear(actual: number | undefined, expected: number): void {
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(CLOSE_PX);
}

async function leftOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("the page is not on screen");
  }
  return box.x;
}

async function expectOnPage(page: Page, number: number): Promise<void> {
  await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
    "aria-valuetext",
    `Page ${String(number)} of ${String(PAGE_COUNT)}`,
  );
}

async function dragBy(page: Page, across: number): Promise<void> {
  const box = await page.locator("[data-tap-zones]").boundingBox();
  if (box === null) {
    throw new Error("the tap zones are not on screen");
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + across, y, { steps: 5 });
}

async function dragUnderneath(page: Page, across: number): Promise<void> {
  const surface = page.locator("[data-tap-zones]");
  const box = await surface.boundingBox();
  if (box === null) {
    throw new Error("the tap zones are not on screen");
  }
  const pointer = {
    pointerType: "touch",
    isPrimary: true,
    clientY: box.y + box.height / 2,
  };
  const x = box.x + box.width / 2;
  await surface.dispatchEvent("pointerdown", { ...pointer, clientX: x });
  await surface.dispatchEvent("pointermove", {
    ...pointer,
    clientX: x + across,
  });
  await surface.dispatchEvent("pointerup", { ...pointer, clientX: x + across });
}

function upNext(page: Page): Locator {
  return page.getByRole("heading", {
    level: 2,
    name: `${BOOK_TITLE} finished`,
  });
}

test("moves the page with the finger while it slides, then turns it", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  const start = await leftOf(shownPage(page, 14));

  await dragBy(page, -DRAG_PX);

  expect(
    Math.abs((await leftOf(shownPage(page, 14))) - (start - DRAG_PX)),
  ).toBeLessThan(CLOSE_PX);
  await page.mouse.up();
  await expectOnPage(page, 15);
  await expect
    .poll(async () => Math.abs((await leftOf(shownPage(page, 15))) - start))
    .toBeLessThan(CLOSE_PX);
});

test("puts the page back when a slide stops short of turning it", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  const start = await leftOf(shownPage(page, 14));

  await dragBy(page, -SHORT_DRAG_PX);
  await page.mouse.up();

  await expect
    .poll(async () => Math.abs((await leftOf(shownPage(page, 14))) - start))
    .toBeLessThan(CLOSE_PX);
  await expectOnPage(page, 14);
});

test("keeps the page still under the finger when pages turn at once", async ({
  page,
}) => {
  await openBookWith(page, {});
  const start = await leftOf(shownPage(page, 14));

  await dragBy(page, -DRAG_PX);

  expect(await leftOf(shownPage(page, 14))).toBe(start);
  await page.mouse.up();
  await expectOnPage(page, 15);
});

test("settles a slide at once with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBookWith(page, { pageTurn: "slide" });
  const start = await leftOf(shownPage(page, 14));

  await dragBy(page, -SHORT_DRAG_PX);
  expect(await leftOf(shownPage(page, 14))).toBeLessThan(start - CLOSE_PX);
  await page.mouse.up();

  expect(Math.abs((await leftOf(shownPage(page, 14))) - start)).toBeLessThan(
    CLOSE_PX,
  );
});

const DRAGS = [
  { turn: "next", to: 15, drag: -DRAG_PX, side: RIGHT },
  { turn: "previous", to: 13, drag: DRAG_PX, side: LEFT },
] as const;

for (const { turn, to, drag, side } of DRAGS) {
  test(`draws the ${turn} page beside the page shown while a drag turns to it, both moving with the finger`, async ({
    page,
  }) => {
    await openBookWith(page, { pageTurn: "slide" });
    await expectDecoded(page, to);
    const start = await leftOf(shownPage(page, 14));
    const width = await pageAreaWidth(page);

    await dragBy(page, drag);

    await expect(anyPage(page, to)).toBeVisible();
    expectNear(await leftOf(shownPage(page, 14)), start + drag);
    expectNear(await leftOf(anyPage(page, to)), start + drag + side * width);
  });
}

test.describe("a book read right to left", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND, OPENING),
      openBook: () => ({
        ...readerBook(OPENING),
        readingDirection: "rightToLeft",
      }),
    },
  });

  const RIGHT_TO_LEFT_DRAGS = [
    { turn: "next", to: 15, drag: DRAG_PX, side: LEFT },
    { turn: "previous", to: 13, drag: -DRAG_PX, side: RIGHT },
  ] as const;

  for (const { turn, to, drag, side } of RIGHT_TO_LEFT_DRAGS) {
    test(`draws the ${turn} page on its own side while a drag turns to it`, async ({
      page,
    }) => {
      await openBookWith(page, { pageTurn: "slide" });
      await expectDecoded(page, to);
      const start = await leftOf(shownPage(page, 14));
      const width = await pageAreaWidth(page);

      await dragBy(page, drag);

      await expect(anyPage(page, to)).toBeVisible();
      expectNear(await leftOf(anyPage(page, to)), start + drag + side * width);
    });
  }

  test("keeps the double-tapped point under the pointer as the page zooms in", async ({
    page,
  }) => {
    await expectZoomKeepsTheTappedPoint(page);
  });

  test("slides the last page back in from the right on turning back from Up next", async ({
    page,
  }) => {
    await openBookWith(page, { pageTurn: "slide" });
    await page.keyboard.press("End");
    await expect(shownPage(page, PAGE_COUNT)).toBeVisible();
    const start = await leftOf(shownPage(page, PAGE_COUNT));
    const width = await pageAreaWidth(page);
    await page.keyboard.press("ArrowLeft");
    await expect(upNext(page)).toBeVisible();
    await finishSlides(page);

    await page.keyboard.press("ArrowRight");
    const { moving, frames } = await framesOfTheTurn(page, [PAGE_COUNT]);

    expect(moving).toBeGreaterThan(0);
    expectNear(frames[0]?.[0]?.x, start + width);
    expectNear(frames.at(-1)?.[0]?.x, start);
  });
});

test("carries both pages on together after a drag past the turn, with no frame left without a page", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await expectDecoded(page, 15);
  const start = await leftOf(shownPage(page, 14));
  const width = await pageAreaWidth(page);
  await dragBy(page, -DRAG_PX);

  await page.mouse.up();
  const { moving, frames } = await framesOfTheTurn(page, [14, 15]);

  expect(moving).toBeGreaterThan(0);
  expectNear(frames[0]?.[0]?.x, start - DRAG_PX);
  for (const frame of frames) {
    expectBeside(frame, RIGHT, width);
  }
  expectNear(frames.at(-1)?.[1]?.x, start);
  await expectOnPage(page, 15);
});

test("springs both pages back together after a drag short of the turn", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await expectDecoded(page, 15);
  const start = await leftOf(shownPage(page, 14));
  const width = await pageAreaWidth(page);
  await dragBy(page, -SHORT_DRAG_PX);

  await page.mouse.up();
  const { frames } = await framesOfTheTurn(page, [14, 15]);

  expectNear(frames[0]?.[0]?.x, start - SHORT_DRAG_PX);
  for (const frame of frames) {
    expectBeside(frame, RIGHT, width);
  }
  expectNear(frames.at(-1)?.[0]?.x, start);
  await expectOnPage(page, 14);
});

const TAP_TURNS = [
  {
    way: "a tap on the next page's side",
    turn: (page: Page) =>
      page.getByRole("button", { name: "Next page" }).click(),
  },
  {
    way: "the right arrow",
    turn: (page: Page) => page.keyboard.press("ArrowRight"),
  },
];

for (const { way, turn } of TAP_TURNS) {
  test(`slides the next page in from the right on ${way} with Slide`, async ({
    page,
  }) => {
    await openBookWith(page, { pageTurn: "slide" });
    await expectDecoded(page, 15);
    const start = await leftOf(shownPage(page, 14));
    const width = await pageAreaWidth(page);

    await turn(page);
    const { moving, frames } = await framesOfTheTurn(page, [14, 15]);

    expect(moving).toBeGreaterThan(0);
    expectNear(frames[0]?.[1]?.x, start + width);
    for (const frame of frames) {
      expectBeside(frame, RIGHT, width);
    }
    expectNear(frames.at(-1)?.[1]?.x, start);
    await expectOnPage(page, 15);
  });

  test(`swaps the page in one frame on ${way} with Instant`, async ({
    page,
  }) => {
    await openBookWith(page, {});
    const start = await leftOf(shownPage(page, 14));

    await turn(page);
    const { moving } = await framesOfTheTurn(page, [15]);

    expect(moving).toBe(0);
    await expectOnPage(page, 15);
    expectNear(await leftOf(shownPage(page, 15)), start);
  });
}

const STILL_READERS = [
  { why: "reduced motion", stored: {}, reducedMotion: "reduce" },
  {
    why: "the reader's animations off",
    stored: { [ANIMATIONS_STILL_KEY]: "reader" },
    reducedMotion: "no-preference",
  },
] as const;

for (const { why, stored, reducedMotion } of STILL_READERS) {
  test(`turns at once with Slide under ${why}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await openBookWith(page, { pageTurn: "slide" }, { stored });
    const start = await leftOf(shownPage(page, 14));

    await page.keyboard.press("ArrowRight");
    const { moving } = await framesOfTheTurn(page, [15]);

    expect(moving).toBe(0);
    await expectOnPage(page, 15);
    expectNear(await leftOf(shownPage(page, 15)), start);
  });
}

test("slides the last page back in from the left on turning back from Up next", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await page.keyboard.press("End");
  await expect(shownPage(page, PAGE_COUNT)).toBeVisible();
  const start = await leftOf(shownPage(page, PAGE_COUNT));
  const width = await pageAreaWidth(page);
  await page.keyboard.press("ArrowRight");
  await expect(upNext(page)).toBeVisible();
  await finishSlides(page);

  await page.keyboard.press("ArrowLeft");
  const { moving, frames } = await framesOfTheTurn(page, [PAGE_COUNT]);

  expect(moving).toBeGreaterThan(0);
  expectNear(frames[0]?.[0]?.x, start - width);
  expectNear(frames.at(-1)?.[0]?.x, start);
});

test("brings the last page back from the left with a drag back from Up next", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await page.keyboard.press("End");
  await expect(shownPage(page, PAGE_COUNT)).toBeVisible();
  const start = await leftOf(shownPage(page, PAGE_COUNT));
  const width = await pageAreaWidth(page);
  await page.keyboard.press("ArrowRight");
  await expect(upNext(page)).toBeVisible();
  await finishSlides(page);

  await dragUnderneath(page, DRAG_PX);
  const { frames } = await framesOfTheTurn(page, [PAGE_COUNT]);

  expectNear(frames[0]?.[0]?.x, start - width + DRAG_PX);
  expectNear(frames.at(-1)?.[0]?.x, start);
  await expect(shownPage(page, PAGE_COUNT)).toBeVisible();
});

test.describe("two pages at a time", () => {
  for (const { turn, to, drag, side } of [
    { turn: "next", to: 16, drag: -DRAG_PX, side: RIGHT },
    { turn: "previous", to: 12, drag: DRAG_PX, side: LEFT },
  ] as const) {
    test(`moves the ${turn} pair as one page beside the pair shown`, async ({
      page,
    }) => {
      await openBookWith(page, { pageTurn: "slide", layout: "two" });
      await expect(shownPage(page, 15)).toBeVisible();
      await expectDecoded(page, to);
      await expectDecoded(page, to + 1);
      const width = await pageAreaWidth(page);

      await dragBy(page, drag);

      await expect(anyPage(page, to)).toBeVisible();
      await expect(anyPage(page, to + 1)).toBeVisible();
      const first = await leftOf(shownPage(page, 14));
      expectNear(await leftOf(anyPage(page, to)), first + side * width);
      expectNear(
        (await leftOf(anyPage(page, to + 1))) -
          (await leftOf(anyPage(page, to))),
        (await leftOf(shownPage(page, 15))) - first,
      );
    });
  }
});

test("pans rather than slides when pinched in", async ({ page }) => {
  await openBookWith(page, { pageTurn: "slide" });
  const start = await leftOf(shownPage(page, 14));
  await pinchTo(page, 2);

  await dragBy(page, -DRAG_PX);

  expect(await leftOf(shownPage(page, 14))).toBe(start);
  await expect(anyPage(page, 15)).toBeHidden();
  await expect(anyPage(page, 13)).toBeHidden();
  await page.mouse.up();
  await expectOnPage(page, 14);
});

test("pans rather than turns after a double tap zooms the page in", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await page
    .getByRole("button", { name: /^(Show|Hide) the controls$/ })
    .dblclick();
  await expect(page.locator("[data-tap-zones]")).toHaveCSS(
    "touch-action",
    "manipulation",
  );
  const start = await leftOf(shownPage(page, 14));

  await dragBy(page, -DRAG_PX);

  expect(await leftOf(shownPage(page, 14))).toBe(start);
  await expect(anyPage(page, 15)).toBeHidden();
  await page.mouse.up();
  await expectOnPage(page, 14);
});

test("keeps a tapped slide running while the pointer moves with no button down", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await slowSlides(page);
  await expectDecoded(page, 15);
  const start = await leftOf(shownPage(page, 14));
  const width = await pageAreaWidth(page);
  const next = page.getByRole("button", { name: "Next page" });
  await next.click();
  const box = await next.boundingBox();
  if (box === null) {
    throw new Error("the next page zone is not on screen");
  }

  await page.mouse.move(
    box.x + box.width / 2 + SMALL_MOVE_PX,
    box.y + box.height / 2 + SMALL_MOVE_PX,
  );
  const { moving, frames } = await framesOfTheTurn(page, [14, 15]);

  expect(moving).toBeGreaterThan(0);
  expectNear(frames[0]?.[1]?.x, start + width);
  expectBeside(frames[2] ?? [], RIGHT, width);
});

test("picks a slide up where it is when a drag starts during it", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await slowSlides(page);
  await expectDecoded(page, 15);
  await page.keyboard.press("ArrowRight");
  await holdSlidesAt(page, MID_TURN[0]);
  const held = await leftOf(shownPage(page, 15));

  await dragBy(page, -DRAG_PX);

  expectNear(await leftOf(shownPage(page, 15)), held - DRAG_PX);
});

test("covers the screen with pages through two turns a moment apart", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await slowSlides(page);
  await expectDecoded(page, 15);
  await expectDecoded(page, 16);
  await page.keyboard.press("ArrowRight");
  await holdSlidesAt(page, QUICK_TURN_MS / SLIDE_MS);

  await page.keyboard.press("ArrowRight");
  const seen = await cellsOfTheTurn(page);

  expect(seen.map(({ gaps }) => gaps)).toEqual(TURN_SHARES.map(() => 0));
  await expectOnPage(page, 16);
});

test("paints only the pages on screen, at rest and mid-turn", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await expectDecoded(page, 15);
  const atRest = await cellsOfTheTurn(page, AT_REST);

  await page.keyboard.press("ArrowRight");
  const midTurn = await cellsOfTheTurn(page, MID_TURN);

  expect([...atRest, ...midTurn]).toEqual([
    { gaps: 0, offScreen: 0 },
    { gaps: 0, offScreen: 0 },
  ]);
});

test("draws nothing before the first page and springs it back after a drag back", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await page.keyboard.press("Home");
  await expect(shownPage(page, 1)).toBeVisible();
  const start = await leftOf(shownPage(page, 1));

  await dragBy(page, DRAG_PX);
  const dragged = await cellsOfTheTurn(page, AT_REST);
  expectNear(await leftOf(shownPage(page, 1)), start + DRAG_PX);
  await page.mouse.up();
  const { frames } = await framesOfTheTurn(page, [1]);

  expect(dragged.map(({ offScreen }) => offScreen)).toEqual([0]);
  expectNear(frames[0]?.[0]?.x, start + DRAG_PX);
  expectNear(frames.at(-1)?.[0]?.x, start);
  await expectOnPage(page, 1);
});

test("leaves no slide waiting after a turn that moves nothing", async ({
  page,
}) => {
  await openBookWith(page, { pageTurn: "slide" });
  await page.keyboard.press("Home");
  await expect(shownPage(page, 1)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  const size = page.viewportSize();
  if (size === null) {
    throw new Error("the page has no viewport size");
  }

  await page.setViewportSize({
    width: size.width - SMALL_MOVE_PX,
    height: size.height,
  });
  const { moving } = await framesOfTheTurn(page, [1]);

  expect(moving).toBe(0);
});

test("turns to a page that never arrives, showing it loading, and on past it", async ({
  page,
}) => {
  await openBookWith(
    page,
    { pageTurn: "slide" },
    {
      pageArrives: (index) =>
        index === NEVER_ARRIVING_PAGE - 1
          ? new Promise<void>(() => undefined)
          : Promise.resolve(),
    },
  );
  await page.keyboard.press("ArrowRight");
  await expectOnPage(page, NEVER_ARRIVING_PAGE - 1);

  await page.keyboard.press("ArrowRight");
  await expectOnPage(page, NEVER_ARRIVING_PAGE);
  await expect(
    page.getByText(`Loading page ${String(NEVER_ARRIVING_PAGE)}`),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");

  await expectOnPage(page, NEVER_ARRIVING_PAGE + 1);
  await expect.poll(() => pageDrawnAtRest(page)).toBe(NEVER_ARRIVING_PAGE + 1);
});

test.describe("pages whose size is not known yet", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND, OPENING),
      openBook: () => {
        const book = readerBook(OPENING);
        return {
          ...book,
          pages: book.pages.map((bookPage) => ({ ...bookPage, size: null })),
        };
      },
    },
  });

  for (const { layout, shown } of [
    { layout: "one", shown: [14] },
    { layout: "two", shown: [14, 15] },
  ] as const) {
    test(`fits each page to the screen at rest, ${layout} at a time`, async ({
      page,
    }) => {
      await openBookWith(page, { pageTurn: "slide", layout });
      const area = await page.locator("[data-shown-page]").boundingBox();

      for (const number of shown) {
        const box = await shownPage(page, number).boundingBox();
        expect(box).not.toBeNull();
        expect(area).not.toBeNull();
        expect(box?.width ?? Number.NaN).toBeLessThanOrEqual(
          (area?.width ?? Number.NaN) / shown.length + CLOSE_PX,
        );
        expect(box?.height ?? Number.NaN).toBeLessThanOrEqual(
          (area?.height ?? Number.NaN) + CLOSE_PX,
        );
      }
    });
  }
});

async function expectZoomKeepsTheTappedPoint(page: Page): Promise<void> {
  await openBookWith(page, { pageTurn: "slide" });
  const middle = await page
    .getByRole("button", { name: /^(Show|Hide) the controls$/ })
    .boundingBox();
  const before = await shownPage(page, 14).boundingBox();
  const area = await page.locator("[data-shown-page]").boundingBox();
  if (middle === null || before === null || area === null) {
    throw new Error("the page is not on screen");
  }
  const point = {
    x: middle.x + middle.width * TAPPED_ACROSS,
    y: middle.y + middle.height * TAPPED_DOWN,
  };
  const share = {
    x: (point.x - before.x) / before.width,
    y: (point.y - before.y) / before.height,
  };

  await page.mouse.dblclick(point.x, point.y);
  await expect(page.getByText("200%", { exact: false })).toBeVisible();
  const after = await shownPage(page, 14).boundingBox();

  expect(after).not.toBeNull();
  const zoomed = after ?? before;
  expectNear(
    zoomed.x,
    heldPlace(point.x - share.x * zoomed.width, {
      start: area.x,
      room: area.width,
      size: zoomed.width,
    }),
  );
  expectNear(
    zoomed.y,
    heldPlace(point.y - share.y * zoomed.height, {
      start: area.y,
      room: area.height,
      size: zoomed.height,
    }),
  );
}

function heldPlace(
  wanted: number,
  { start, room, size }: { start: number; room: number; size: number },
): number {
  if (size <= room) {
    return start + (room - size) / 2;
  }
  return Math.min(start, Math.max(start + room - size, wanted));
}

test("keeps the double-tapped point under the pointer as the page zooms in", async ({
  page,
}) => {
  await expectZoomKeepsTheTappedPoint(page);
});

test("chooses Slide under Pages in Reading settings", async ({ page }) => {
  await openBookWith(page, {});
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
  const settings = page
    .getByRole("dialog", { name: "Reading settings" })
    .or(page.getByRole("complementary", { name: "Reading settings" }));
  await expect(settings).toBeVisible();
  await settle(settings);

  const pages = page.getByRole("region", { name: "Pages" });
  await expect(pages.getByRole("group", { name: "Tap zones" })).toBeVisible();
  await expect(
    pages.getByText("Slide follows your finger.", { exact: false }),
  ).toBeVisible();
  await pages
    .getByRole("group", { name: "Page turn" })
    .getByRole("radio", { name: "Slide" })
    .click();

  await expect
    .poll(
      async () =>
        JSON.parse(
          (await page.evaluate((key) => localStorage.getItem(key), LOOK_KEY)) ??
            "{}",
        ) as unknown,
    )
    .toMatchObject({ pageTurn: "slide" });
  await expect(
    page
      .getByRole("region", { name: "Screen" })
      .getByRole("switch", { name: "Keep the screen on" }),
  ).toBeVisible();
});
