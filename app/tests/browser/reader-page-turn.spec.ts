import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, settle, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  PAGE_COUNT,
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
const OPENING = {
  reading: { state: "started", page: 14 },
  startPage: 13,
} as const;
const RIGHT = 1;
const LEFT = -1;

type Side = typeof RIGHT | typeof LEFT;

test.use({ backend: readerBackend(DEFAULT_BACKEND, OPENING) });

async function openBookWith(
  page: Page,
  look: object,
  stored: Record<string, string> = {},
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
  await servePages(page);
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
            animation instanceof CSSTransition &&
            animation.transitionProperty === "translate",
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
    await openBookWith(page, { pageTurn: "slide" }, stored);
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
  await page.mouse.up();
  await expectOnPage(page, 14);
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
