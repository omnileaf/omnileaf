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
  LARGE_MIN_WIDTH,
  onPlatform,
  settle,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_POSITION,
  BOOK_SERIES_ID,
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
const SERIES_PAGE = new RegExp(`/series/${BOOK_SERIES_ID}$`);
const BACK_TO_SERIES = `Back to ${BOOK_SERIES_TITLE}`;

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

async function openBook(page: Page): Promise<void> {
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function shownPage(page: Page, number: number): Locator {
  return page.getByRole("img", { name: `Page ${String(number)}`, exact: true });
}

async function expectOnPage(page: Page, number: number): Promise<void> {
  await expect(shownPage(page, number)).toBeVisible();
  await expect(slider(page)).toHaveAttribute(
    "aria-valuetext",
    `Page ${String(number)} of ${String(PAGE_COUNT)}`,
  );
}

function zone(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

function slider(page: Page): Locator {
  return page.getByRole("slider", { name: "Page" });
}

function controls(page: Page): Locator {
  return page.getByRole("link", { name: BACK_TO_SERIES, exact: true });
}

function pageCounts(page: Page, number: number): Locator {
  return page
    .getByRole("main")
    .getByText(`${String(number)} / ${String(PAGE_COUNT)}`, { exact: true });
}

/** The bars holding the controls, which stay reachable by keyboard and screen reader while hidden. */
function controlBars(page: Page): Locator {
  return page.locator("main > header, main > div:has(input[type=range])");
}

async function expectControlsShown(page: Page): Promise<void> {
  for (const bar of await controlBars(page).all()) {
    await expect(bar).toHaveCSS("opacity", "1");
  }
}

async function expectControlsHidden(page: Page): Promise<void> {
  for (const bar of await controlBars(page).all()) {
    await expect(bar).toHaveCSS("opacity", "0");
  }
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
  await expectControlsHidden(page);
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

const PHONE_PREVIEWS = { before: 1, after: 4 };
const WIDE_PREVIEWS = { before: 3, after: 7 };

function pagesAround(
  number: number,
  { before, after }: { before: number; after: number },
): string[] {
  return Array.from({ length: before + after + 1 }, (_, offset) =>
    String(number - before + offset),
  );
}

async function dragSliderTo(page: Page, across: number): Promise<void> {
  const track = await boxOf(slider(page));
  const y = track.y + track.height / 2;
  await page.mouse.move(track.x + track.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * across, y, { steps: 4 });
}

test("fills the previews from the first page while the slider is dragged to the start", async ({
  page,
}) => {
  await openBook(page);
  const isWide = viewportOf(page).width >= EXPANDED_MIN_WIDTH;

  await dragSliderTo(page, 0);

  const { before, after } = isWide ? WIDE_PREVIEWS : PHONE_PREVIEWS;
  await expect(
    nearbyPages(page).getByRole("listitem").filter({ visible: true }),
  ).toHaveText(pagesAround(1 + before, { before, after }));
  await page.mouse.up();
});

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
  const near = nearbyPages(page)
    .getByRole("listitem")
    .filter({ visible: true });
  await expect(near).toHaveText(
    pagesAround(shownNumber, isWide ? WIDE_PREVIEWS : PHONE_PREVIEWS),
  );
  await expect(near.and(page.locator('[aria-current="page"]'))).toContainText(
    String(shownNumber),
  );
  await expect(
    nearbyPages(page).getByRole("button", {
      name: `Page ${String(shownNumber + 1)}`,
    }),
  ).toBeVisible();
});

test("keeps the previews up once the slider is let go, until the controls hide", async ({
  page,
}) => {
  await openBook(page);

  await dragSliderTo(page, 0.5);
  await page.mouse.up();

  await expect(nearbyPages(page)).toBeVisible();
  await zone(page, "Hide the controls").click();
  await expect(nearbyPages(page)).toBeHidden();
  await zone(page, "Show the controls").click();
  await expect(nearbyPages(page)).toBeHidden();
});

test("opens a page tapped in the previews", async ({ page }) => {
  await openBook(page);
  await dragSliderTo(page, 0.5);
  await page.mouse.up();
  const shownNumber = Number(await slider(page).inputValue());

  await nearbyPages(page)
    .getByRole("button", { name: `Page ${String(shownNumber + 2)}` })
    .click();

  await expectOnPage(page, shownNumber + 2);
});

test("shows the previews while the slider has keyboard focus, following the arrow keys", async ({
  page,
}) => {
  await openBook(page);
  await slider(page).focus();

  await page.keyboard.press("ArrowRight");

  await expect(nearbyPages(page)).toBeVisible();
  await expect(
    nearbyPages(page).locator('[aria-current="page"]'),
  ).toContainText("2");
});

test("shows the previews while a mouse rests on the controls bar", async ({
  page,
}) => {
  await openBook(page);
  const track = await boxOf(slider(page));

  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);

  await expect(nearbyPages(page)).toBeVisible();
  await page.mouse.move(track.x + track.width / 2, track.y - 300);
  await expect(nearbyPages(page)).toBeHidden();
});

test("shows small thumbnails of the nearby pages, not the pages themselves", async ({
  page,
}) => {
  await openBook(page);
  const track = await boxOf(slider(page));
  const y = track.y + track.height / 2;

  await page.mouse.move(track.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width / 2, y, { steps: 4 });

  const sources = await nearbyPages(page)
    .locator("img")
    .evaluateAll((images) =>
      images.map((image) =>
        image instanceof HTMLImageElement ? image.src : "",
      ),
    );
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) {
    expect(source).toContain("/page-thumb/v1/");
  }
});

test("stays on the first page when asked to turn back from it", async ({
  page,
}) => {
  await openBook(page);

  await zone(page, "Previous page").click();

  await expectOnPage(page, 1);
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

const ANNOUNCE_DELAY_MS = 300;

/** A jump ahead well clear of the time a loaded machine takes between installing the clock and pausing it. */
const PAUSE_AHEAD_MS = 60_000;

/** Opens the book on a clock of the test's own, then holds it still, so the page's timers fire only as the test runs it on. */
async function openBookWithTimeStopped(page: Page): Promise<void> {
  await page.clock.install();
  await openBook(page);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + PAUSE_AHEAD_MS);
}

async function noteStatus(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const status = document.querySelector('main > p[role="status"]');
    if (status === null) {
      throw new Error("the reader has no status");
    }
    const said: string[] = [];
    Object.assign(window, { saidByStatus: said });
    new MutationObserver(() => {
      said.push(status.textContent.trim());
    }).observe(status, { subtree: true, childList: true, characterData: true });
  });
  return () =>
    page.evaluate(() =>
      "saidByStatus" in window && Array.isArray(window.saidByStatus)
        ? window.saidByStatus.map(String)
        : [],
    );
}

test("says only the page the turns stop on, once they stop", async ({
  page,
}) => {
  await openBookWithTimeStopped(page);
  const said = await noteStatus(page);

  for (const key of ["ArrowRight", "ArrowRight", "ArrowRight"]) {
    await page.keyboard.press(key);
  }
  await expectOnPage(page, 4);
  await page.clock.runFor(ANNOUNCE_DELAY_MS);

  expect(await said()).toEqual(["Page 4 of 30"]);
});

test("leaves saying the page to the slider while it has focus", async ({
  page,
}) => {
  await openBookWithTimeStopped(page);
  const said = await noteStatus(page);

  await slider(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider(page)).toHaveAttribute("aria-valuetext", "Page 2 of 30");
  await page.clock.runFor(ANNOUNCE_DELAY_MS);

  expect(await said()).toEqual([]);
});

test("hides and shows the controls with a tap in the middle of the page and the M key", async ({
  page,
}) => {
  await openBook(page);

  await zone(page, "Hide the controls").click();
  await expectControlsHidden(page);
  await zone(page, "Show the controls").click();
  await expectControlsShown(page);
  await page.keyboard.press("m");

  await expectControlsHidden(page);
});

const CONTROLS_HIDE_AFTER_MS = 3000;
/** Playwright's clock draws a frame every 16ms; the controls count their time from the frame they are drawn in, or from the one after the opening page. */
const FRAME_MS = 16;
/** Far enough ahead for the pause to arrive before it, and well short of the time the controls stay up for. */
const CONTROLS_PAUSE_AHEAD_MS = 500;

async function pauseClockSoon(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + CONTROLS_PAUSE_AHEAD_MS);
}

/** Opens the book and holds its clock still once its first page shows, before the controls would hide by themselves. */
async function openBookBeforeControlsHide(page: Page): Promise<void> {
  await page.clock.install();
  await openBook(page);
  await expect(shownPage(page, 1)).toBeVisible();
  await pauseClockSoon(page);
}

test("shows the controls as a book opens, then hides them by themselves", async ({
  page,
}) => {
  await openBookBeforeControlsHide(page);
  await expectControlsShown(page);

  await page.clock.runFor(CONTROLS_HIDE_AFTER_MS);

  await expectControlsHidden(page);
});

test("keeps the controls up while the book's first page is on its way", async ({
  page,
}) => {
  let release = (): void => {};
  const arrival = new Promise<void>((resolve) => {
    release = resolve;
  });
  await servePages(page, () => arrival);
  await page.clock.install();
  await openBook(page);
  await pauseClockSoon(page);

  await page.clock.runFor(CONTROLS_HIDE_AFTER_MS * 2);
  await expectControlsShown(page);
  release();
  await expect(shownPage(page, 1)).toBeVisible();
  await page.clock.runFor(CONTROLS_HIDE_AFTER_MS + 2 * FRAME_MS);

  await expectControlsHidden(page);
});

test("hides the controls at once on a page turn", async ({ page }) => {
  await openBookBeforeControlsHide(page);

  await page.keyboard.press("ArrowRight");

  await expectControlsHidden(page);
});

test("hides the controls shown by a tap again after the same delay", async ({
  page,
}) => {
  await openBookBeforeControlsHide(page);
  await page.keyboard.press("ArrowRight");
  await zone(page, "Show the controls").click();

  await page.clock.runFor(CONTROLS_HIDE_AFTER_MS - 1);
  await expectControlsShown(page);
  await page.clock.runFor(FRAME_MS + 1);

  await expectControlsHidden(page);
});

test("keeps the controls up while the pointer rests on them", async ({
  page,
}) => {
  await openBookBeforeControlsHide(page);
  await slider(page).hover();

  await page.clock.runFor(CONTROLS_HIDE_AFTER_MS * 2);
  await expectControlsShown(page);
  const { width, height } = viewportOf(page);
  await page.mouse.move(width / 2, height / 2);
  await page.clock.runFor(CONTROLS_HIDE_AFTER_MS + FRAME_MS);

  await expectControlsHidden(page);
});

test("shows hidden controls when the pointer reaches the top or bottom edge", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "pointer screens only");
  await openBookBeforeControlsHide(page);
  const { width, height } = viewportOf(page);
  await page.mouse.move(width / 2, height / 2);
  await page.keyboard.press("ArrowRight");
  await expectControlsHidden(page);

  await page.mouse.move(width / 2, 1);
  await expectControlsShown(page);
  await page.keyboard.press("ArrowRight");
  await expectControlsHidden(page);
  await page.mouse.move(width / 2, height - 1);

  await expectControlsShown(page);
});

test("keeps hidden controls down when the page moves under a pointer resting at the edge", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "pointer screens only");
  await openBookBeforeControlsHide(page);
  const { width, height } = viewportOf(page);
  await page.mouse.move(width / 2, height - 1);
  await expectControlsShown(page);
  await page.keyboard.press("ArrowRight");
  await expectControlsHidden(page);

  await page.locator("main").dispatchEvent("pointermove", {
    pointerType: "mouse",
    clientX: width / 2,
    clientY: height - 1,
  });

  await expectControlsHidden(page);
});

test("shows hidden controls for a control reached with the keyboard and keeps them while it has focus", async ({
  page,
}) => {
  await openBookBeforeControlsHide(page);
  await page.keyboard.press("ArrowRight");
  await expectControlsHidden(page);

  await controls(page).focus();
  await page.clock.runFor(CONTROLS_HIDE_AFTER_MS * 2);

  await expectControlsShown(page);
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

test("goes back to the series with the back button", async ({ page }) => {
  await openBook(page);

  await controls(page).click();

  await expect(page).toHaveURL(SERIES_PAGE);
});

test("goes back to the series with Escape", async ({ page }) => {
  await openBook(page);

  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(SERIES_PAGE);
});

test("goes back to the series from the chevron, the book's title opening Jump to a book instead", async ({
  page,
}) => {
  await openBook(page);
  await expect(
    page.locator("main > header").getByRole("button", {
      name: "Jump to a book",
    }),
  ).toBeAttached();

  await page
    .locator("main > header")
    .getByRole("link", { name: BACK_TO_SERIES, exact: true })
    .click();

  await expect(page).toHaveURL(SERIES_PAGE);
});

test("goes back to the series from the breadcrumb on a wide screen", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH,
    "phones name the book in the title link",
  );
  await openBook(page);
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.locator('[aria-current="page"]')).toContainText(
    BOOK_TITLE,
  );

  await breadcrumb.getByRole("link", { name: BOOK_SERIES_TITLE }).click();

  await expect(page).toHaveURL(SERIES_PAGE);
});

test("keeps a small page count on screen while the controls are hidden", async ({
  page,
}) => {
  await openBook(page);
  await expect(pageCounts(page, 1)).toHaveCount(1);

  await page.keyboard.press("ArrowRight");
  await expectControlsHidden(page);
  await expect(pageCounts(page, 2)).toHaveCount(2);
  await zone(page, "Show the controls").click();

  await expect(pageCounts(page, 2)).toHaveCount(1);
});

test("lays the bottom bar out as previous chapter, page count, slider and next chapter", async ({
  page,
}) => {
  await openBook(page);

  const lefts = await Promise.all(
    [
      page.getByRole("link", {
        name: `Previous chapter: ${PREVIOUS_BOOK.title}`,
      }),
      pageCounts(page, 1),
      slider(page),
      page.getByRole("link", { name: `Next chapter: ${NEXT_BOOK.title}` }),
    ].map(async (control) => (await boxOf(control)).x),
  );

  expect(lefts).toEqual([...lefts].sort((left, right) => left - right));
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
  await expect(page.getByText("Loading page 1", { exact: true })).toBeVisible();
});

test("says so when a page can't be shown, and that the rest of the book still opens", async ({
  page,
}) => {
  await page.unrouteAll();
  await page.route(fakeProtocolRoute("omni"), (route) => route.abort());
  await openBook(page);

  await expect(page.getByText("This page couldn't be shown.")).toBeVisible();
  await expect(
    page.getByText(
      `Page 1 may be damaged. The rest of ${BOOK_TITLE} still opens.`,
    ),
  ).toBeVisible();
});

test("turns on from a page that can't be shown with Next page", async ({
  page,
}) => {
  await failFirstPage(page, Number.POSITIVE_INFINITY);
  await openBook(page);

  await pageProblem(page).getByRole("button", { name: "Next page" }).click();

  await expectOnPage(page, 2);
});

test("asks again for a page that couldn't be shown with Try again", async ({
  page,
}) => {
  await failFirstPage(page, 2);
  await openBook(page);
  await expect(page.getByText("This page couldn't be shown.")).toBeVisible();

  await pageProblem(page).getByRole("button", { name: "Try again" }).click();

  await expectOnPage(page, 1);
  await expect(page.getByText("This page couldn't be shown.")).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`a page that can't be shown has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await failFirstPage(page, Number.POSITIVE_INFINITY);
    await openBook(page);
    await expect(page.getByText("This page couldn't be shown.")).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

function pageProblem(page: Page): Locator {
  return page.getByRole("region", { name: "This page couldn't be shown." });
}

async function failFirstPage(page: Page, times: number): Promise<void> {
  let failures = 0;
  await page.route(fakeProtocolRoute("omni"), async (route) => {
    if (pageIndexOf(route.request().url()) === 0 && failures < times) {
      failures += 1;
      await route.abort();
      return;
    }
    await route.fallback();
  });
}

test("shows a page whose first request failed without waiting to come back to it", async ({
  page,
}) => {
  await failFirstPage(page, 1);

  await openBook(page);

  await expectOnPage(page, 1);
  await expect(page.getByText("This page couldn't be shown.")).toHaveCount(0);
});

test("shows a page that failed again on asking twice when it loads on coming back to it", async ({
  page,
}) => {
  await failFirstPage(page, 2);
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

function directionButton(page: Page): Locator {
  return page.getByRole("button", { name: /^(Left to right|Right to left)/ });
}

async function chooseDirection(page: Page, name: string): Promise<void> {
  await directionButton(page).click();
  await page
    .getByRole("menuitemradio", {
      name: name === "Automatic" ? /^Automatic/ : name,
      exact: name !== "Automatic",
    })
    .click();
  await expect(page.getByRole("menu")).toBeHidden();
}

test.describe("the reading direction", () => {
  test("reads left to right until chosen otherwise when the book doesn't say, marking the choice as the app's", async ({
    page,
  }) => {
    await openBook(page);

    await expect(directionButton(page)).toHaveAccessibleName(
      "Left to right AUTO",
    );
  });

  test("turns on with the left tap, the left arrow and a swipe to the right once right to left is chosen", async ({
    page,
  }) => {
    await openBook(page);
    await chooseDirection(page, "Right to left");
    await expect(directionButton(page)).toHaveAccessibleName("Right to left");

    const next = await boxOf(zone(page, "Next page"));
    const previous = await boxOf(zone(page, "Previous page"));
    expect(next.x).toBeLessThan(previous.x);
    await zone(page, "Next page").click();
    await expectOnPage(page, 2);
    await page.keyboard.press("ArrowLeft");
    await expectOnPage(page, 3);
    await swipe(page, SWIPE_PX);

    await expectOnPage(page, 4);
  });

  test("shows the pages ahead to the left of the one dragged to in a book read right to left", async ({
    page,
  }) => {
    await openBook(page);
    await chooseDirection(page, "Right to left");

    await dragSliderTo(page, 0.5);

    const shownNumber = Number(await slider(page).inputValue());
    const shown = await boxOf(
      nearbyPages(page).getByText(String(shownNumber), { exact: true }),
    );
    const ahead = await boxOf(
      nearbyPages(page).getByText(String(shownNumber + 1), { exact: true }),
    );
    expect(ahead.x).toBeLessThan(shown.x);
    await page.mouse.up();
  });

  test("fills the slider from the right in a book read right to left", async ({
    page,
  }) => {
    await openBook(page);
    await chooseDirection(page, "Right to left");
    await page.keyboard.press("End");
    await expectOnPage(page, PAGE_COUNT);

    const track = await boxOf(slider(page));
    const thumb = await boxOf(page.locator(".reader-progress-thumb"));

    expect(thumb.x - track.x).toBeLessThan(track.width / 2);
  });

  test("keeps the previous chapter on the left and the next on the right in a book read right to left", async ({
    page,
  }) => {
    await openBook(page);
    await chooseDirection(page, "Right to left");

    const previous = await boxOf(
      page.getByRole("link", {
        name: `Previous chapter: ${PREVIOUS_BOOK.title}`,
      }),
    );
    const next = await boxOf(
      page.getByRole("link", { name: `Next chapter: ${NEXT_BOOK.title}` }),
    );

    expect(previous.x).toBeLessThan(next.x);
  });

  test("remembers the direction chosen for the series", async ({ page }) => {
    await openBook(page);
    await chooseDirection(page, "Right to left");

    await page.reload();

    await expect(directionButton(page)).toHaveAccessibleName("Right to left");
  });

  test("goes back to letting the app choose", async ({ page }) => {
    await openBook(page);
    await chooseDirection(page, "Right to left");

    await chooseDirection(page, "Automatic");

    await expect(directionButton(page)).toHaveAccessibleName(
      "Left to right AUTO",
    );
  });

  test.describe("in a book that says it reads right to left", () => {
    test.use({
      backend: {
        ...readerBackend(DEFAULT_BACKEND),
        openBook: () => ({
          ...readerBook(NOT_STARTED),
          readingDirection: "rightToLeft",
        }),
      },
    });

    test("reads right to left, saying the app detected it", async ({
      page,
    }) => {
      await openBook(page);

      await expect(directionButton(page)).toHaveAccessibleName(
        "Right to left AUTO",
      );
      const next = await boxOf(zone(page, "Next page"));
      const previous = await boxOf(zone(page, "Previous page"));
      expect(next.x).toBeLessThan(previous.x);
    });

    test("reads left to right once chosen by hand", async ({ page }) => {
      await openBook(page);

      await chooseDirection(page, "Left to right");

      await expect(directionButton(page)).toHaveAccessibleName("Left to right");
    });
  });

  test("closes the direction menu with Escape and stays in the book", async ({
    page,
  }) => {
    await openBook(page);
    await directionButton(page).click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("menu")).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
  });

  test("keeps the controls up while the direction menu is open", async ({
    page,
  }) => {
    await openBookBeforeControlsHide(page);
    await directionButton(page).click();

    await page.clock.runFor(CONTROLS_HIDE_AFTER_MS * 2);

    await expectControlsShown(page);
  });

  test("puts the quick settings in the top bar on a large screen and above the slider on a smaller one", async ({
    page,
  }) => {
    await openBook(page);

    const quickSettings = page.getByRole("group", { name: "Quick settings" });
    const bar =
      viewportOf(page).width >= LARGE_MIN_WIDTH
        ? page.locator("main > header")
        : page.locator("main > div:has(input[type=range])");

    await expect(
      bar.getByRole("group", { name: "Quick settings" }),
    ).toBeVisible();
    await expect(quickSettings).toHaveCount(1);
    await expect(quickSettings.getByRole("button")).toHaveText(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH
        ? [/^\s*Left to right/, "Two pages", "Fit height", "Light"]
        : [/^\s*Left to right/, "Two pages", "Light"],
    );
  });
});

test.describe("the controls still to come", () => {
  const COMING_SOON = ["Bookmark this page"] as const;

  function comingSoon(page: Page, name: string): Locator {
    return page.getByRole("button", { name, exact: true });
  }

  for (const name of COMING_SOON) {
    test(`shows ${name} as unavailable yet reachable, saying it's coming soon`, async ({
      page,
    }) => {
      await openBook(page);
      const control = comingSoon(page, name);

      await control.hover();

      await expect(control).toHaveAttribute("aria-disabled", "true");
      await expect(control).not.toHaveAttribute("disabled");
      await expect(
        page.getByText(`${name} · coming soon`, { exact: true }),
      ).toBeVisible();
      await expect(control).toHaveAccessibleDescription(
        `${name} · coming soon`,
      );
      await expect(control).not.toHaveAttribute("title");
    });

    test(`does nothing when ${name} is clicked or pressed`, async ({
      page,
    }) => {
      await openBook(page);
      const control = comingSoon(page, name);

      await control.click({ force: true });
      await control.focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Space");

      await expect(control).toBeFocused();
      await expectOnPage(page, 1);
      await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  }

  test("puts keyboard shortcuts and the bookmark in the top bar, before full screen", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < EXPANDED_MIN_WIDTH,
      "phones leave keyboard shortcuts out",
    );
    await openBook(page);
    const bar = page.locator("main > header");

    const shortcuts = await boxOf(
      bar.getByRole("button", { name: "Keyboard shortcuts" }),
    );
    const bookmark = await boxOf(
      bar.getByRole("button", { name: "Bookmark this page" }),
    );

    expect(shortcuts.x).toBeLessThan(bookmark.x);
    if (viewportOf(page).width >= EXPANDED_MIN_WIDTH) {
      const fullScreen = await boxOf(
        bar.getByRole("button", { name: "Full screen" }),
      );
      expect(bookmark.x).toBeLessThan(fullScreen.x);
    }
  });
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

test.describe("saving where reading is", () => {
  const heard: string[] = [];

  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND, {
        reading: { state: "started", page: 14 },
        startPage: 13,
      }),
      readingRestored: (id, page) => {
        heard.push(`restored ${id} ${String(page)}`);
        return null;
      },
      pageShown: (id, page) => {
        heard.push(`shown ${id} ${String(page)}`);
        return null;
      },
      closeBook: (id) => {
        heard.push(`closed ${id}`);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    heard.length = 0;
  });

  test("tells the core the page it opened on, then each page turned to", async ({
    page,
  }) => {
    await openBook(page);
    await expectOnPage(page, 14);

    await zone(page, "Next page").click();
    await expectOnPage(page, 15);
    await page.keyboard.press("Home");

    await expect
      .poll(() => heard)
      .toEqual([
        `restored ${BOOK_ID} 13`,
        `shown ${BOOK_ID} 14`,
        `shown ${BOOK_ID} 0`,
      ]);
  });

  test("tells the core the book closed once it goes back to the library", async ({
    page,
  }) => {
    await openBook(page);
    await expect.poll(() => heard).toEqual([`restored ${BOOK_ID} 13`]);

    await page.keyboard.press("Escape");

    await expect
      .poll(() => heard)
      .toEqual([`restored ${BOOK_ID} 13`, `closed ${BOOK_ID}`]);
  });
});

test.describe("the local time reading begins at", () => {
  const offsets: number[] = [];
  const shownOffsets: number[] = [];

  test.use({
    timezoneId: "Asia/Kolkata",
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      readingRestored: (_id, _page, utcOffset) => {
        offsets.push(utcOffset);
        return null;
      },
      pageShown: (_id, _page, utcOffset) => {
        shownOffsets.push(utcOffset);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    offsets.length = 0;
    shownOffsets.length = 0;
  });

  test("tells the core how far the device's clock is ahead of UTC as the book opens", async ({
    page,
  }) => {
    await openBook(page);

    await expect.poll(() => offsets).toEqual([330]);
  });

  test("tells the core how far the device's clock is ahead of UTC with each page turned to, as a session may start on it", async ({
    page,
  }) => {
    await openBook(page);

    await zone(page, "Next page").click();

    await expect.poll(() => shownOffsets).toEqual([330]);
  });
});

test.describe("full screen", () => {
  const changes: FullScreenChange[] = [];
  const closed: string[] = [];
  let isFullScreen = false;

  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      changeFullScreen: (change) => {
        changes.push(change);
        const wasFullScreen = isFullScreen;
        isFullScreen = change === "toggle" && !wasFullScreen;
        return wasFullScreen;
      },
      closeBook: (id) => {
        closed.push(id);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    changes.length = 0;
    closed.length = 0;
    isFullScreen = false;
  });

  test("goes in or out of full screen with F and leaves it when the book closes", async ({
    page,
  }) => {
    await openBook(page);

    await page.keyboard.press("f");
    await page.keyboard.press("f");
    await page.keyboard.press("Escape");

    await expect(page).toHaveURL(SERIES_PAGE);
    await expect
      .poll(() => changes)
      .toEqual(["toggle", "toggle", "leave", "leave"]);
  });

  test("leaves full screen with Escape before a second Escape closes the book", async ({
    page,
  }) => {
    await openBook(page);
    await page.keyboard.press("f");

    await page.keyboard.press("Escape");
    await expect.poll(() => changes).toEqual(["toggle", "leave"]);
    await expect(slider(page)).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page).toHaveURL(SERIES_PAGE);
  });

  test("tells the core the book closed only once Escape leaves the book, not full screen", async ({
    page,
  }) => {
    await openBook(page);
    await page.keyboard.press("f");

    await page.keyboard.press("Escape");
    await expect.poll(() => changes).toEqual(["toggle", "leave"]);
    await expect(slider(page)).toBeVisible();
    const closedInFullScreen = [...closed];
    await page.keyboard.press("Escape");

    await expect(page).toHaveURL(SERIES_PAGE);
    expect(closedInFullScreen).toEqual([]);
    await expect.poll(() => closed).toEqual([BOOK_ID]);
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
        document
          .elementFromPoint(x, y)
          ?.closest("a")
          ?.getAttribute("aria-label"),
      { x: link.x + link.width / 2, y: link.y - reach + 1 },
    );

    expect(touched).toBe(BACK_TO_SERIES);
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

  test("lands on the heading saying so", async ({ page }) => {
    await page.goto(`/read/${BOOK_ID}`);

    await expect(
      page.getByRole("heading", { name: "This book isn't in your library" }),
    ).toBeFocused();
  });
});

test.describe("a book that couldn't be opened for a reason of the app's own", () => {
  const turns: ScreenOrientation[] = [];

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: () => {
        throw new CommandFailure({
          code: "internal",
          message: "the library database could not be reached",
        });
      },
      orientScreen: (orientation) => {
        turns.push(orientation);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    turns.length = 0;
  });

  test("lands on a heading of its own saying something went wrong", async ({
    page,
  }) => {
    await page.goto(`/read/${BOOK_ID}`);

    const heading = page.getByRole("heading", {
      level: 1,
      name: "Something went wrong",
    });
    await expect(heading).toBeFocused();
    await expect(page.getByText("Couldn't open this book.")).toBeVisible();
  });

  test("keeps the screen upright and the interface unzoomed, as no book is shown", async ({
    page,
  }) => {
    await page.goto(`/read/${BOOK_ID}`);
    await expect(
      page.getByRole("heading", { name: "Something went wrong" }),
    ).toBeVisible();

    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");

    expect(viewport).toContain("maximum-scale=1");
    expect(turns).toEqual([]);
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
  const STAND_IN = /^Back to Series \d{2,3}$/;

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

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `Book ${String(BOOK_POSITION)}`,
      }),
    ).toBeAttached();
    await expect(page.getByRole("link", { name: STAND_IN })).toHaveCount(1);
    const shown = (await page.getByRole("main").textContent()) ?? "";
    expect(shown).not.toContain(BOOK_SERIES_TITLE);
    expect(shown).not.toContain(BOOK_TITLE);
  });

  test("blanks each page to a grey panel saying which page it is, without reading it", async ({
    page,
  }) => {
    const asked = await servePages(page);
    await page.goto(`/read/${BOOK_ID}`);

    await expect(shownPage(page, 1)).toBeVisible();
    await expect(
      shownPage(page, 1).getByText(`Page 1 of ${String(PAGE_COUNT)}`),
    ).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(shownPage(page, 2)).toBeVisible();

    expect(asked).toEqual([]);
  });

  test("shows the pages themselves once blank pages are turned off", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({
          activity: { kind: "on" },
          options: {
            blankReaderPages: false,
            showLabel: true,
            turnOffAfterAnHour: false,
          },
        }),
      );
    });
    await page.goto(`/read/${BOOK_ID}`);

    await expect(page.locator('img[alt="Page 1"]')).toBeVisible();
  });

  test("blanks the nearby pages' thumbnails while the slider is dragged, keeping their numbers", async ({
    page,
  }) => {
    await page.goto(`/read/${BOOK_ID}`);
    const track = await boxOf(slider(page));
    const y = track.y + track.height / 2;

    await page.mouse.move(track.x + 2, y);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width / 2, y, { steps: 4 });

    await expect(nearbyPages(page).getByRole("listitem").first()).toBeVisible();
    await expect(nearbyPages(page).locator("img")).toHaveCount(0);
    await page.mouse.up();
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
        return false;
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
      .getByRole("link", { name: `Next chapter: ${NEXT_BOOK.title}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`/read/${NEXT_BOOK.id}$`));
    await page
      .getByRole("link", { name: `Previous chapter: ${PREVIOUS_BOOK.title}` })
      .click();

    await expect(page).toHaveURL(new RegExp(`/read/${PREVIOUS_BOOK.id}$`));
  });

  test("stays in full screen and keeps the screen turning on the way to the next book", async ({
    page,
  }) => {
    await openBook(page);
    await page.keyboard.press("f");

    await page
      .getByRole("link", { name: `Next chapter: ${NEXT_BOOK.title}` })
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
      page.getByRole("button", { name: "Previous chapter" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: `Next chapter: ${NEXT_BOOK.title}` }),
    ).toBeVisible();
  });
  test("names the missing book before it in a tooltip, as the links have", async ({
    page,
  }) => {
    await openBook(page);

    const previous = page.getByRole("button", { name: "Previous chapter" });
    await previous.hover();
    await expect(previous).toHaveAccessibleDescription("Previous chapter");
    await expect(previous).not.toHaveAttribute("title");
  });
});

test.describe("on an iPad in landscape", () => {
  const IOS_TOUCH_TARGET_PX = 44;
  const IOS_SLIDER_THUMB_PX = 24;

  test.use({
    backend: readerBackend(onPlatform("ios").backend),
    viewport: { width: 1180, height: 820 },
  });

  test("lays the reader out as on desktop with controls sized for touch", async ({
    page,
  }) => {
    await openBook(page);

    await expect(controls(page)).toHaveText(BOOK_SERIES_TITLE);
    const sizes = await Promise.all(
      [
        controls(page),
        slider(page),
        page.getByRole("link", { name: `Next chapter: ${NEXT_BOOK.title}` }),
      ].map(async (control) => (await boxOf(control)).height),
    );
    for (const height of sizes) {
      expect(height).toBeGreaterThanOrEqual(IOS_TOUCH_TARGET_PX);
    }
  });

  test("gives the slider a thumb sized for touch", async ({ page }) => {
    await openBook(page);

    const thumb = await boxOf(page.locator("[data-progress-thumb]"));

    expect(thumb.width).toBe(IOS_SLIDER_THUMB_PX);
    expect(thumb.height).toBe(IOS_SLIDER_THUMB_PX);
  });
});

test.describe("with a pointer", () => {
  test.skip(({ isMobile }) => isMobile, "pointer screens only");

  async function tintOf(control: Locator): Promise<string> {
    await settle(control);
    return control.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.backgroundColor} ${style.backgroundImage}`;
    });
  }

  const READER_CONTROLS = [
    { name: "the back link", find: controls },
    {
      name: "the full screen button",
      find: (page: Page) => page.getByRole("button", { name: "Full screen" }),
    },
    {
      name: "the next book's link",
      find: (page: Page) =>
        page.getByRole("link", { name: `Next chapter: ${NEXT_BOOK.title}` }),
    },
  ];

  for (const { name, find } of READER_CONTROLS) {
    test(`tints ${name} under the pointer and deepens it while pressed`, async ({
      page,
    }) => {
      await openBook(page);
      const control = find(page);
      const resting = await tintOf(control);

      await control.hover();
      const hovered = await tintOf(control);
      await page.mouse.down();
      const pressed = await tintOf(control);

      expect(hovered).not.toBe(resting);
      expect(pressed).not.toBe(hovered);
    });
  }

  test("names the full screen button in a tooltip", async ({ page }) => {
    await openBook(page);

    const fullScreen = page.getByRole("button", { name: "Full screen" });
    await fullScreen.hover();
    await expect(fullScreen).toHaveAccessibleDescription("Full screen");
    await expect(fullScreen).not.toHaveAttribute("title");
  });
});

test.describe("pinched in", () => {
  async function pinchTo(page: Page, scale: number): Promise<void> {
    await page.evaluate((pinched) => {
      const viewport = window.visualViewport;
      if (viewport === null) {
        throw new Error("the browser has no visual viewport");
      }
      Object.defineProperty(viewport, "scale", {
        configurable: true,
        get: () => pinched,
      });
      viewport.dispatchEvent(new Event("resize"));
    }, scale);
  }

  function surfaceTouchAction(page: Page): Promise<string> {
    return zone(page, "Next page")
      .locator("..")
      .evaluate((surface) => getComputedStyle(surface).touchAction);
  }

  test("lets a drag pan the zoomed page either way rather than turn it", async ({
    page,
  }) => {
    await openBook(page);

    await pinchTo(page, 2);

    await expect.poll(() => surfaceTouchAction(page)).toBe("manipulation");
    await swipe(page, -SWIPE_PX);
    await zone(page, "Next page").click();
    await zone(page, "Previous page").click();
    await expect(slider(page)).toHaveValue("1");
    await expectOnPage(page, 1);
  });

  test("turns pages with swipes and taps again once zoomed back out", async ({
    page,
  }) => {
    await openBook(page);
    await pinchTo(page, 2);

    await pinchTo(page, 1);

    await expect.poll(() => surfaceTouchAction(page)).toBe("pan-y pinch-zoom");
    await swipe(page, -SWIPE_PX);
    await expectOnPage(page, 2);
    await zone(page, "Next page").click();
    await expectOnPage(page, 3);
  });
});

test.describe("zooming", () => {
  function viewportSettings(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() => {
      const content =
        document
          .querySelector('meta[name="viewport"]')
          ?.getAttribute("content") ?? "";
      return Object.fromEntries(
        content.split(",").map((setting) => {
          const [key = "", value = ""] = setting.split("=");
          return [key.trim(), value.trim()];
        }),
      );
    });
  }

  function rootTouchAction(page: Page): Promise<string> {
    return page.evaluate(
      () => getComputedStyle(document.documentElement).touchAction,
    );
  }

  test("lets a page be pinched to zoom while a book is open", async ({
    page,
  }) => {
    await openBook(page);

    const settings = await viewportSettings(page);

    expect(settings).not.toHaveProperty("maximum-scale");
    expect(settings).not.toHaveProperty("user-scalable");
    expect(await rootTouchAction(page)).toBe("manipulation");
  });

  test("keeps the rest of the app from zooming again once the book closes", async ({
    page,
  }) => {
    await openBook(page);

    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(SERIES_PAGE);

    expect(await viewportSettings(page)).toMatchObject({
      "maximum-scale": "1",
      "user-scalable": "no",
    });
    expect(await rootTouchAction(page)).toBe("pan-x pan-y");
  });
});
