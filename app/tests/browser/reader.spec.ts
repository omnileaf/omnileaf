import type { Locator, Page } from "@playwright/test";

import type {
  FullScreenChange,
  ScreenOrientation,
} from "../../src/lib/ipc/bindings.ts";
import { CommandFailure, fakeProtocolRoute } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_POSITION,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
  NEXT_BOOK,
  NOT_STARTED,
  PAGE_COUNT,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  pageIndexOf,
  PREVIOUS_BOOK,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const SWIPE_PX = 120;
const ANDROID_TOUCH_TARGET_PX = 48;
const FADE_MS = "0.15s";
const NO_TIME = "0s";

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

async function openBook(page: Page): Promise<void> {
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_SERIES_TITLE }),
  ).toBeVisible();
}

function shownPage(page: Page, number: number): Locator {
  return page.getByRole("img", { name: `Page ${String(number)}`, exact: true });
}

async function expectOnPage(page: Page, number: number): Promise<void> {
  await expect(shownPage(page, number)).toBeVisible();
  await expect(
    page.getByText(
      `${BOOK_TITLE} · Page ${String(number)} of ${String(PAGE_COUNT)}`,
    ),
  ).toBeVisible();
}

function zone(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

function slider(page: Page): Locator {
  return page.getByRole("slider", { name: "Page" });
}

function controls(page: Page): Locator {
  return page.getByRole("link", { name: /Library|Back to the library/ });
}

async function swipe(page: Page, across: number): Promise<void> {
  const surface = zone(page, "Next page").locator("..");
  const box = await boxOf(surface);
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  const pointer = { pointerType: "touch", isPrimary: true, clientY: y };
  await surface.dispatchEvent("pointerdown", { ...pointer, clientX: x });
  await surface.dispatchEvent("pointerup", { ...pointer, clientX: x + across });
}

test.beforeEach(async ({ page }) => {
  await servePages(page);
});

test("opens a book on its first page with the series and book named", async ({
  page,
}) => {
  await openBook(page);

  await expectOnPage(page, 1);
  await expect(slider(page)).toHaveAttribute("aria-valuetext", "Page 1 of 30");
  await expect(page.getByText("1 / 30")).toBeVisible();
});

test.describe("a book started before", () => {
  test.use({
    backend: readerBackend(DEFAULT_BACKEND, {
      reading: { state: "started", page: 14 },
      startPage: 13,
    }),
  });

  test("opens on the page reading goes on from", async ({ page }) => {
    await openBook(page);

    await expectOnPage(page, 14);
    await expect(slider(page)).toHaveValue("14");
  });
});

test("turns to the next and previous page with the taps at the page's edges", async ({
  page,
}) => {
  await openBook(page);

  await zone(page, "Next page").click();
  await expectOnPage(page, 2);
  await zone(page, "Next page").click();
  await zone(page, "Previous page").click();

  await expectOnPage(page, 2);
});

test("keeps the next page's tap on the right in a right-to-left interface, as the book reads", async ({
  page,
}) => {
  await openBook(page);
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });

  const next = await boxOf(zone(page, "Next page"));
  const previous = await boxOf(zone(page, "Previous page"));

  expect(next.x).toBeGreaterThan(previous.x);
});

test("turns pages with the arrows, Page Up and Down, and Space with or without Shift", async ({
  page,
}) => {
  await openBook(page);

  for (const key of ["ArrowRight", "PageDown", "Space"]) {
    await page.keyboard.press(key);
  }
  await expectOnPage(page, 4);
  for (const key of ["ArrowLeft", "PageUp"]) {
    await page.keyboard.press(key);
  }
  await page.keyboard.press("Shift+Space");

  await expectOnPage(page, 1);
});

test("keeps turning pages with Space after a tap shows or hides the controls", async ({
  page,
}) => {
  await openBook(page);
  await zone(page, "Hide the controls").click();

  await page.keyboard.press("Space");

  await expect(shownPage(page, 2)).toBeVisible();
  await expect(controls(page)).toBeHidden();
});

test("jumps to the last and first pages with End and Home", async ({
  page,
}) => {
  await openBook(page);

  await page.keyboard.press("End");
  await expectOnPage(page, PAGE_COUNT);
  await page.keyboard.press("Home");

  await expectOnPage(page, 1);
});

test("turns pages with a swipe across the page", async ({ page }) => {
  await openBook(page);

  await swipe(page, -SWIPE_PX);
  await swipe(page, -SWIPE_PX);
  await expectOnPage(page, 3);
  await swipe(page, SWIPE_PX);

  await expectOnPage(page, 2);
});

test("goes to any page with the slider", async ({ page }) => {
  await openBook(page);

  await slider(page).fill("17");
  await expectOnPage(page, 17);
  await slider(page).focus();
  await page.keyboard.press("ArrowLeft");

  await expectOnPage(page, 16);
  await expect(slider(page)).toHaveAttribute("aria-valuetext", "Page 16 of 30");
});

function nearbyPages(page: Page): Locator {
  return page.getByRole("list", { name: "Nearby pages" });
}

test("shows the pages near the one dragged to while the slider is dragged", async ({
  page,
}) => {
  await openBook(page);
  const track = await boxOf(slider(page));
  const y = track.y + track.height / 2;
  const isWide = viewportOf(page).width >= EXPANDED_MIN_WIDTH;

  await page.mouse.move(track.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width / 2, y, { steps: 4 });

  const shownNumber = Number(await slider(page).inputValue());
  const near = nearbyPages(page).getByRole("listitem");
  await expect(near).toHaveCount(isWide ? 7 : 5);
  await expect(near.and(page.locator('[aria-current="page"]'))).toContainText(
    String(shownNumber),
  );
  await expect(
    nearbyPages(page).getByRole("img", {
      name: `Page ${String(shownNumber + 1)}`,
    }),
  ).toBeVisible();

  await page.mouse.up();

  await expect(nearbyPages(page)).toBeHidden();
});

test("stays on the first and last pages when asked to turn past them", async ({
  page,
}) => {
  await openBook(page);

  await zone(page, "Previous page").click();
  await expectOnPage(page, 1);
  await page.keyboard.press("End");
  await zone(page, "Next page").click();

  await expectOnPage(page, PAGE_COUNT);
});

test("says which page is up to a screen reader as pages turn", async ({
  page,
}) => {
  await openBook(page);

  await page.keyboard.press("ArrowRight");

  await expect(
    page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: "Page 2 of 30" }),
  ).toBeAttached();
});

test("hides and shows the controls with a tap in the middle of the page and the M key", async ({
  page,
}) => {
  await openBook(page);

  await zone(page, "Hide the controls").click();
  await expect(controls(page)).toBeHidden();
  await expect(slider(page)).toBeHidden();
  await zone(page, "Show the controls").click();
  await expect(controls(page)).toBeVisible();
  await page.keyboard.press("m");

  await expect(controls(page)).toBeHidden();
});

test("fades the controls in and out, unless motion is reduced", async ({
  page,
}) => {
  await openBook(page);
  const panel = slider(page).locator(
    "xpath=ancestor::div[contains(@class, 'transition-all')][1]",
  );

  const moving = await panel.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await panel.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );

  expect(moving).toBe(FADE_MS);
  expect(still).toBe(NO_TIME);
});

test("goes back to the library with Escape and with the back link", async ({
  page,
}) => {
  await openBook(page);

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
  await openBook(page);
  await controls(page).click();

  await expect(page).toHaveURL(/\/$/);
});

test("lays a page out at its own shape before it arrives, fitted whole to the screen", async ({
  page,
}) => {
  await page.unrouteAll();
  await servePages(page, () => new Promise(() => {}));
  await openBook(page);
  const frame = page.locator('img[alt="Page 1"]').locator("..");

  const box = await boxOf(frame);

  const { width, height } = viewportOf(page);
  const scale = Math.min(width / PAGE_WIDTH, height / PAGE_HEIGHT);
  expect(box.width).toBeCloseTo(PAGE_WIDTH * scale, 0);
  expect(box.height).toBeCloseTo(PAGE_HEIGHT * scale, 0);
});

test("shows that a slow page is on its way", async ({ page }) => {
  await page.unrouteAll();
  await servePages(page, () => new Promise(() => {}));
  await openBook(page);

  await expect(
    page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: "Loading page 1" }),
  ).toBeAttached();
});

test("says so when a page can't be shown", async ({ page }) => {
  await page.unrouteAll();
  await page.route(fakeProtocolRoute("omni"), (route) => route.abort());
  await openBook(page);

  await expect(page.getByText("This page couldn't be shown.")).toBeVisible();
});

test("shows a page that failed once when it loads on coming back to it", async ({
  page,
}) => {
  let hasFailedOnce = false;
  await page.route(fakeProtocolRoute("omni"), async (route) => {
    if (pageIndexOf(route.request().url()) === 0 && !hasFailedOnce) {
      hasFailedOnce = true;
      await route.abort();
      return;
    }
    await route.fallback();
  });
  await openBook(page);
  await expect(page.getByText("This page couldn't be shown.")).toBeVisible();
  await page.keyboard.press("End");
  await expectOnPage(page, PAGE_COUNT);

  await page.keyboard.press("Home");

  await expectOnPage(page, 1);
  await expect(page.getByText("This page couldn't be shown.")).toHaveCount(0);
});

test("asks for the pages ahead before they're turned to, and keeps one behind", async ({
  page,
}) => {
  await page.unrouteAll();
  const asked = await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expectOnPage(page, 1);
  await page.keyboard.press("End");
  await expectOnPage(page, PAGE_COUNT);

  await expect
    .poll(() => [...new Set(asked)].sort((a, b) => a - b))
    .toEqual([0, 1, 2, 3, PAGE_COUNT - 2, PAGE_COUNT - 1]);
});

test("turns to a page read ahead without waiting for it", async ({ page }) => {
  await openBook(page);
  const next = page.locator('img[alt="Page 2"]');
  await expect(next).not.toHaveClass(/invisible/);

  await page.keyboard.press("ArrowRight");

  await expect(shownPage(page, 2)).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("status").filter({ hasText: "Loading" }),
  ).toHaveCount(0);
});

test.describe("the screen's orientation", () => {
  const asked: ScreenOrientation[] = [];

  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      orientScreen: (orientation) => {
        asked.push(orientation);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    asked.length = 0;
  });

  test("follows the device while a book is read and keeps phones upright once it's closed", async ({
    page,
  }) => {
    await openBook(page);
    await expect.poll(() => asked).toEqual(["followDevice"]);

    await page.keyboard.press("Escape");

    await expect
      .poll(() => asked)
      .toEqual(["followDevice", "portraitOnPhones"]);
  });
});

test.describe("full screen", () => {
  const changes: FullScreenChange[] = [];

  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      changeFullScreen: (change) => {
        changes.push(change);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    changes.length = 0;
  });

  test("goes in or out of full screen with F and leaves it when the book closes", async ({
    page,
  }) => {
    await openBook(page);

    await page.keyboard.press("f");
    await page.keyboard.press("Escape");

    await expect.poll(() => changes).toEqual(["toggle", "leave"]);
  });

  test("goes in or out of full screen with the top bar's button on a wide screen", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < EXPANDED_MIN_WIDTH,
      "the boards draw the button on wide screens only",
    );
    await openBook(page);

    await page.getByRole("button", { name: "Full screen" }).click();

    await expect.poll(() => changes).toEqual(["toggle"]);
  });

  test("has no full screen button on a phone's narrow screen", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "wide screens draw the button",
    );
    await openBook(page);

    await expect(
      page.getByRole("button", { name: "Full screen" }),
    ).toBeHidden();
  });
});

test.describe("on Android", () => {
  test.use({ backend: readerBackend(onPlatform("android").backend) });

  test("answers a touch within 48 dp of the back link while drawing it at the boards' size", async ({
    page,
  }) => {
    await openBook(page);
    const link = await boxOf(controls(page));
    const reach = (ANDROID_TOUCH_TARGET_PX - link.height) / 2;

    const touched = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest("a")?.textContent.trim(),
      { x: link.x + link.width / 2, y: link.y - reach + 1 },
    );

    expect(touched).toMatch(/Library|Back to the library/);
    expect(link.height).toBeLessThan(ANDROID_TOUCH_TARGET_PX);
  });

  test("has no full screen button, since the app has no window to fill the screen with", async ({
    page,
  }) => {
    await openBook(page);

    await expect(
      page.getByRole("button", { name: "Full screen" }),
    ).toBeHidden();
  });

  test("gives the page slider a touch target 48 dp tall", async ({ page }) => {
    await openBook(page);

    const slid = await boxOf(slider(page));

    expect(slid.height).toBe(ANDROID_TOUCH_TARGET_PX);
  });
});

test.describe("formats the webview can't decode", () => {
  const reported: string[][] = [];

  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      openBook: (_, undecodable) => {
        reported.push(undecodable);
        return readerBook({ reading: { state: "notStarted" }, startPage: 0 });
      },
    },
  });

  test.beforeEach(() => {
    reported.length = 0;
  });

  test("are reported as the book opens, never WebP, which every webview shows", async ({
    page,
  }) => {
    await openBook(page);

    expect(reported).toHaveLength(1);
    const [undecodable = []] = reported;
    expect(undecodable).not.toContain("webp");
    expect(
      undecodable.every((format) => ["webp", "jxl"].includes(format)),
    ).toBe(true);
  });

  test("leave out JPEG XL in Chromium, which shows it", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "only Chromium is known to show JPEG XL",
    );

    await openBook(page);

    expect(reported).toEqual([[]]);
  });
});

test.describe("a book the library doesn't hold", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: () => {
        throw new CommandFailure({
          code: "bookNotFound",
          message: "that book isn't in the library",
        });
      },
    },
  });

  test("says the book isn't in the library", async ({ page }) => {
    await page.goto(`/read/${BOOK_ID}`);

    await expect(
      page.getByRole("heading", { name: "This book isn't in your library" }),
    ).toBeVisible();
  });
});

test.describe("a book whose file can't be read", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: () => {
        throw new CommandFailure({
          code: "bookUnreadable",
          message: "the book's file could not be read",
        });
      },
    },
  });

  test("says the book couldn't be opened", async ({ page }) => {
    await page.goto(`/read/${BOOK_ID}`);

    await expect(
      page.getByRole("heading", { name: "This book couldn't be opened" }),
    ).toBeVisible();
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the reader has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openBook(page);
    await expect(shownPage(page, 1)).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test.describe("while Screenshot mode is on", () => {
  const STAND_IN = /^Series \d{2,3}$/;

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({ activity: { kind: "on" } }),
      );
    });
  });

  test("names the series and book by their stand-ins, the book by its place in the series", async ({
    page,
  }) => {
    await page.goto(`/read/${BOOK_ID}`);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText(STAND_IN);
    const standIn = (await heading.textContent()) ?? "";

    await expect(
      page.getByText(
        `${standIn} · Book ${String(BOOK_POSITION)} · Page 1 of ${String(PAGE_COUNT)}`,
      ),
    ).toBeVisible();
    const shown = (await page.getByRole("main").textContent()) ?? "";
    expect(shown).not.toContain(BOOK_SERIES_TITLE);
    expect(shown).not.toContain(BOOK_TITLE);
  });
});

test.describe("the books either side", () => {
  const changes: FullScreenChange[] = [];
  const turns: ScreenOrientation[] = [];

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
      changeFullScreen: (change) => {
        changes.push(change);
        return null;
      },
      orientScreen: (orientation) => {
        turns.push(orientation);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    changes.length = 0;
    turns.length = 0;
  });

  test("goes on to the next book and back to the one before from beside the slider", async ({
    page,
  }) => {
    await openBook(page);

    await page
      .getByRole("link", { name: `Next book: ${NEXT_BOOK.title}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`/read/${NEXT_BOOK.id}$`));
    await page
      .getByRole("link", { name: `Previous book: ${PREVIOUS_BOOK.title}` })
      .click();

    await expect(page).toHaveURL(new RegExp(`/read/${PREVIOUS_BOOK.id}$`));
  });

  test("names the books either side beside the slider on a wide screen", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < EXPANDED_MIN_WIDTH,
      "the boards draw only their arrows on narrow screens",
    );
    await openBook(page);

    await expect(page.getByText(PREVIOUS_BOOK.title)).toBeVisible();
    await expect(page.getByText(NEXT_BOOK.title)).toBeVisible();
  });

  test("stays in full screen and keeps the screen turning on the way to the next book", async ({
    page,
  }) => {
    await openBook(page);
    await page.keyboard.press("f");

    await page
      .getByRole("link", { name: `Next book: ${NEXT_BOOK.title}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`/read/${NEXT_BOOK.id}$`));
    await expect(slider(page)).toHaveValue("1");

    expect(changes).toEqual(["toggle"]);
    expect(turns).toEqual(["followDevice"]);
  });
});

test.describe("the first book of a series", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: () => ({ ...readerBook(NOT_STARTED), previous: null }),
    },
  });

  test("has no book before it to go back to", async ({ page }) => {
    await openBook(page);

    await expect(
      page.getByRole("button", { name: "Previous book" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: `Next book: ${NEXT_BOOK.title}` }),
    ).toBeVisible();
  });
});

test.describe("on an iPad in landscape", () => {
  const IOS_TOUCH_TARGET_PX = 44;

  test.use({
    backend: readerBackend(onPlatform("ios").backend),
    viewport: { width: 1180, height: 820 },
  });

  test("lays the reader out as on desktop with controls sized for touch", async ({
    page,
  }) => {
    await openBook(page);

    await expect(page.getByText("Library", { exact: true })).toBeVisible();
    await expect(page.getByText(NEXT_BOOK.title)).toBeVisible();
    const sizes = await Promise.all(
      [
        controls(page),
        slider(page),
        page.getByRole("link", { name: `Next book: ${NEXT_BOOK.title}` }),
      ].map(async (control) => (await boxOf(control)).height),
    );
    for (const height of sizes) {
      expect(height).toBeGreaterThanOrEqual(IOS_TOUCH_TARGET_PX);
    }
  });
});
