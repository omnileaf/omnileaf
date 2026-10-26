import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  LARGEST_TEXT_SCALE,
  setTextScale,
  settle,
  targetOf,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
  NOT_STARTED,
  PAGE_COUNT,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const TABLET = { width: 820, height: 1180 };
const IOS_BAR_BUTTON_PX = 44;
const ANDROID_TARGET_PX = 48;
const ANDROID_BUTTON_PX = 40;
const ANDROID_ICON_PX = 24;
const ANDROID_ROW_PX = 56;
const ANDROID_SHEET_TITLE = { size: "22px", leading: "28px", weight: "400" };
const READER_THEME = "dark";
const BACK_TO_LIBRARY = "Back to the library";
const MORE_ROWS = ["Mark read", "Start over", "Show the file", BACK_TO_LIBRARY];
const NO_BLUR = "none";
const CLEAR = "rgba(0, 0, 0, 0)";
const BACK_TO_SERIES = `Back to ${BOOK_SERIES_TITLE}`;
const FIRST_PAGE = `Page 1 of ${String(PAGE_COUNT)}`;
const LANDSCAPE_TABLET = { width: 1180, height: 820 };
const TABLET_MENU_RULE_INSET = "-4px";
const CAPSULE_INLINE_PADDING = "12px";
const BESIDE_CAPSULE_PX = 16;
const IOS_MENU_MAX_PX = 320;
const MIRRORED = "-1 1";
const CONTROLS_HIDE_AFTER_MS = 3000;
const FRAME_MS = 16;
const CONTROLS_PAUSE_AHEAD_MS = 500;
const SHEET_SLIDE_MS = 500;
const LONG_BOOK_TITLE =
  "Volume 3 · Letters from Across the Northern Sea, Written Every Winter by the Lighthouse Keeper";
const STRIP_PAGE_SIZE = { width: 800, height: 2400 };
const SECONDS_PER_PAGE = 15;
const NO_TINT = "none";

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function topBar(page: Page): Locator {
  return page.locator("main > header");
}

function readerActions(page: Page): Locator {
  return page.getByRole("group", { name: "Reader actions" });
}

function quickSettings(page: Page): Locator {
  return page.getByRole("group", { name: "Quick settings" });
}

function controlBars(page: Page): Locator {
  return page.locator("main > header, main > div:has(input[type=range])");
}

async function expectControlsHidden(page: Page): Promise<void> {
  for (const bar of await controlBars(page).all()) {
    await expect(bar).toHaveCSS("opacity", "0");
  }
}

async function openBookBeforeControlsHide(page: Page): Promise<void> {
  await page.clock.install();
  await openBook(page);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + CONTROLS_PAUSE_AHEAD_MS);
}

function spillsOf(within: Locator): Promise<string[]> {
  return within.evaluate((found) => {
    const edge = found.getBoundingClientRect();
    return [...found.querySelectorAll("*")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const isShown = getComputedStyle(element).visibility !== "hidden";
        return (
          isShown &&
          box.width > 0 &&
          (box.left < Math.max(0, edge.left - 1) ||
            box.right > Math.min(innerWidth, edge.right + 1))
        );
      })
      .map((element) => element.outerHTML.slice(0, 80));
  });
}

function blurOf(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => getComputedStyle(element).backdropFilter,
  );
}

function backingOf(bar: Locator): Promise<{
  image: string;
  blur: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
}> {
  return bar.evaluate((element) => {
    const drawn = element.getBoundingClientRect();
    const backing = getComputedStyle(element, "::before");
    const top = drawn.top + Number.parseFloat(backing.top);
    const left = drawn.left + Number.parseFloat(backing.left);
    return {
      image: backing.backgroundImage,
      blur: backing.backdropFilter,
      top,
      bottom: top + Number.parseFloat(backing.height),
      left,
      right: left + Number.parseFloat(backing.width),
    };
  });
}

async function overlappingTargets(
  controls: readonly Locator[],
): Promise<unknown[]> {
  const targets = await Promise.all(
    controls.map(async (control) => {
      const box = await boxOf(control);
      const middle = box.x + box.width / 2;
      return {
        start: middle - ANDROID_TARGET_PX / 2,
        end: middle + ANDROID_TARGET_PX / 2,
      };
    }),
  );
  return targets.flatMap((target, index) =>
    targets
      .slice(index + 1)
      .filter((other) => other.start < target.end && target.start < other.end),
  );
}

async function openStrip(page: Page): Promise<void> {
  await page.addInitScript((series) => {
    localStorage.setItem(`omnileaf.stripFound.${series}`, "seen");
    localStorage.setItem("omnileaf.readerGuide.strip", "seen");
  }, BOOK_SERIES_ID);
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(page.locator("[data-strip]")).toBeVisible();
}

async function holdFingerOn(page: Page, control: Locator): Promise<void> {
  const box = await boxOf(control);
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
}

function comingSoonTooltip(page: Page, feature: string): Locator {
  return page
    .locator("[data-tooltip-content]")
    .filter({ hasText: `${feature} · coming soon` });
}

test.describe("the reader's bars on a phone", { tag: "@native" }, () => {
  test("draws the way back as the phone's own back button", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);

    const back = topBar(page).getByRole("link", { name: BACK_TO_SERIES });
    const box = await boxOf(back);

    await expect(back.locator("[data-icon]")).toHaveAttribute(
      "data-icon",
      platform === "ios" ? "chevron-left" : "arrow-left",
    );
    const side = platform === "ios" ? IOS_BAR_BUTTON_PX : ANDROID_TARGET_PX;
    expect([box.width, box.height]).toEqual([side, side]);
  });

  test("floats the iPhone's title between the back circle and one glass capsule of actions", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await openBook(page);

    const title = topBar(page).getByRole("button", { name: "Jump to a book" });
    const actions = readerActions(page);

    await expect(title).toContainText(BOOK_SERIES_TITLE);
    await expect(title).toContainText(BOOK_TITLE);
    await expect(title).toContainText(`· ${FIRST_PAGE}`);
    await expect(actions.getByRole("button")).toHaveCount(3);
    for (const name of ["Bookmark this page", "Reading settings", "More"]) {
      await expect(
        actions.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    expect(await blurOf(actions)).not.toBe(NO_BLUR);
  });

  test("backs the iPhone's title with the page ground, blurred, from the top of the screen to below the bar", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await openBook(page);

    const title = await boxOf(
      topBar(page).getByRole("button", { name: "Jump to a book" }),
    );
    const backing = await backingOf(topBar(page).locator("> div"));

    expect(backing.image).toContain(
      await tokenColour(page, "--background", READER_THEME),
    );
    expect(backing.blur).not.toBe(NO_BLUR);
    expect(backing.top).toBeLessThanOrEqual(0);
    expect(backing.bottom).toBeGreaterThan(title.y + title.height);
    expect([backing.left, backing.right]).toEqual([0, viewportOf(page).width]);
  });

  test("names the iPhone's title by the words it shows before saying it jumps to a book", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await openBook(page);

    const title = topBar(page).getByRole("button", { name: /Jump to a book/ });

    await expect(title).toHaveAccessibleName(
      new RegExp(
        `^${BOOK_SERIES_TITLE}\\s*${BOOK_TITLE}\\s*· ${FIRST_PAGE}.*Jump to a book$`,
      ),
    );
  });

  test("sets the iPhone's quick settings above the pages, each in its own glass capsule", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await openBook(page);

    const settings = quickSettings(page);
    const pages = page.getByRole("group", { name: "Pages" });
    const twoPages = settings.getByRole("button", { name: "Two pages" });

    expect(await blurOf(settings)).not.toBe(NO_BLUR);
    expect(await blurOf(pages)).not.toBe(NO_BLUR);
    const above = await boxOf(settings);
    expect(above.y + above.height).toBeLessThan((await boxOf(pages)).y);
    const toggle = await boxOf(twoPages);
    expect(toggle.width).toBe(toggle.height);
  });

  test("lets a tap beside or between the iPhone's bottom capsules reach the page", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await openBook(page);
    const settings = await boxOf(quickSettings(page));
    const pages = await boxOf(page.getByRole("group", { name: "Pages" }));
    const points = [
      {
        x: settings.x - BESIDE_CAPSULE_PX,
        y: settings.y + settings.height / 2,
      },
      {
        x: settings.x + settings.width / 2,
        y: (settings.y + settings.height + pages.y) / 2,
      },
    ];

    const caught = await page.evaluate(
      (taps) =>
        taps.map(
          ({ x, y }) =>
            document
              .elementFromPoint(x, y)
              ?.closest("main > div:has(input[type=range])") ?? null,
        ),
      points,
    );

    expect(caught).toEqual([null, null]);
  });

  test("lays the iPhone's nearby pages on a glass plate as wide as the pages capsule", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await openBook(page);
    const pages = page.getByRole("group", { name: "Pages" });

    await pages.getByRole("slider").focus();
    const plate = page
      .getByRole("list", { name: "Nearby pages" })
      .locator("..");
    await expect(plate).toBeVisible();

    await expect(plate).not.toHaveCSS("background-color", CLEAR);
    expect(await blurOf(plate)).not.toBe(NO_BLUR);
    expect((await boxOf(plate)).width).toBeCloseTo(
      (await boxOf(pages)).width,
      0,
    );
  });

  test("words the iPhone's title and its page from whole messages in a longer language", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });
    await openBook(page);

    const title = topBar(page).locator("button[aria-keyshortcuts=G]:visible");

    await expect(title).toHaveAccessibleName(
      new RegExp(`^⟦${BOOK_SERIES_TITLE} ${BOOK_TITLE} [^⟦⟧]*⟧$`),
    );
    await expect(title.getByText(/^⟦·/)).toBeVisible();
  });

  test("draws no plate behind the phone's Reading settings while its sheet is open", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);
    const settings = topBar(page).getByRole("button", {
      name: "Reading settings",
      exact: true,
    });

    await settings.click();
    await expect(settings).toHaveAttribute("aria-expanded", "true");
    await settle(settings);

    await expect(settings).toHaveCSS("background-color", CLEAR);
  });

  test("counts the pages on glass while the iPhone's bars hide", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await openBook(page);

    await page.getByRole("button", { name: "Hide the controls" }).click();

    const count = page
      .locator("main > div[aria-hidden=true] > span")
      .filter({ hasText: "/" });
    await expect(count).toHaveText(`1 / ${String(PAGE_COUNT)}`);
    expect(await blurOf(count)).not.toBe(NO_BLUR);
    await expect(count).toHaveCSS(
      "padding-inline-start",
      CAPSULE_INLINE_PADDING,
    );
  });

  test("opens the iPhone's More as a menu headed by the page and the book", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await openBook(page);

    await readerActions(page).getByRole("button", { name: "More" }).click();

    const menu = page.getByRole("menu");
    const actions = menu.getByRole("group", {
      name: new RegExp(`^${FIRST_PAGE}\\s*${BOOK_TITLE}$`),
    });
    await expect(actions.getByRole("menuitem")).toHaveCount(4);
    const first = actions.getByRole("menuitem").first();
    const rounding = await first.evaluate(
      (item) => getComputedStyle(item).borderTopLeftRadius,
    );
    const last = actions.getByRole("menuitem").last();
    await expect(first).toHaveCSS(
      "border-top-left-radius",
      await last.evaluate(
        (item) => getComputedStyle(item).borderBottomLeftRadius,
      ),
    );
    expect(rounding).not.toBe("0px");
    await expect(menu.getByRole("separator")).toHaveCSS(
      "border-top-color",
      await tokenColour(page, "--native-color-menu-rule", READER_THEME),
    );
  });

  test("opens the iPhone's Light as a sheet half the screen tall that leaves the page undimmed", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await openBook(page);

    await quickSettings(page).getByRole("button", { name: "Light" }).click();
    const sheet = page.getByRole("dialog", {
      name: "Light, for this reader only",
    });
    await settle(sheet);

    await expect(page.locator("[data-dialog-overlay]")).toHaveCSS(
      "background-color",
      CLEAR,
    );
    const { height } = await boxOf(sheet);
    expect(height).toBeCloseTo(viewportOf(page).height / 2, 0);
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toBeHidden();
  });

  test("keeps the iPhone's bars on screen at the largest text in a longer language", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await servePages(page);
    await page.goto(`/read/${BOOK_ID}`);
    const bars = page.locator(
      "main > header, main > div:has(input[type=range])",
    );
    await expect(bars.first()).toBeVisible();

    const spilling = await bars.evaluateAll((found) =>
      found
        .flatMap((bar) => [...bar.querySelectorAll("*")])
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && (box.left < 0 || box.right > innerWidth);
        })
        .map((element) => element.outerHTML.slice(0, 80)),
    );

    expect(spilling).toEqual([]);
  });

  test("draws Android's bar actions as plain icons in the muted ink with a 48 dp target", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);
    const muted = await tokenColour(page, "--secondary-text", READER_THEME);

    for (const name of ["Bookmark this page", "Reading settings", "More"]) {
      const action = topBar(page).getByRole("button", { name, exact: true });
      const box = await boxOf(action);
      const icon = await boxOf(action.locator("[data-icon]"));

      expect([box.width, box.height]).toEqual([
        ANDROID_BUTTON_PX,
        ANDROID_BUTTON_PX,
      ]);
      expect(await targetOf(action)).toEqual({
        width: ANDROID_TARGET_PX,
        height: ANDROID_TARGET_PX,
      });
      expect([icon.width, icon.height]).toEqual([
        ANDROID_ICON_PX,
        ANDROID_ICON_PX,
      ]);
      await expect(action).toHaveCSS("color", muted);
      await expect(action).toHaveCSS("background-color", CLEAR);
    }
  });

  test("gives Android's coming-soon bar action no tint while pressed", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);
    const bookmark = topBar(page).getByRole("button", {
      name: "Bookmark this page",
      exact: true,
    });
    await expect(bookmark).toHaveAttribute("aria-disabled", "true");
    const box = await boxOf(bookmark);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    await expect(bookmark).toHaveCSS("background-image", NO_TINT);
    await page.mouse.up();
  });

  test("names Android's coming-soon bar action in a tooltip once a finger is held on it", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);
    const bookmark = topBar(page).getByRole("button", {
      name: "Bookmark this page",
      exact: true,
    });

    await holdFingerOn(page, bookmark);

    await expect(comingSoonTooltip(page, "Bookmark this page")).toBeVisible();
  });

  test("tints Android's chapter links while pressed", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);
    const next = page.getByRole("link", { name: /^Next chapter/ });
    const box = await boxOf(next);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    await expect(next).not.toHaveCSS("background-image", NO_TINT);
  });

  test("lays Android's bars on the kit's top bar container colour", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);

    await expect(topBar(page).locator("> div")).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-top-bar-scrolled", READER_THEME),
    );
  });

  test("opens Android's More as a sheet of 56 dp rows under the book, its series and page", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);

    await topBar(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: BOOK_TITLE });
    await settle(sheet);

    await expect(sheet).toContainText(`${BOOK_SERIES_TITLE} · ${FIRST_PAGE}`);
    const heading = sheet.getByRole("heading", { name: BOOK_TITLE });
    await expect(heading).toHaveCSS("font-size", ANDROID_SHEET_TITLE.size);
    await expect(heading).toHaveCSS("line-height", ANDROID_SHEET_TITLE.leading);
    await expect(heading).toHaveCSS("font-weight", ANDROID_SHEET_TITLE.weight);
    for (const name of MORE_ROWS) {
      const row = sheet.getByRole(
        name === BACK_TO_LIBRARY ? "link" : "button",
        {
          name,
        },
      );
      expect((await boxOf(row)).height).toBe(ANDROID_ROW_PX);
    }
    const rule = sheet.getByRole("separator");
    await expect(rule).toHaveCount(1);
    await expect(rule).toHaveCSS(
      "border-top-color",
      await tokenColour(page, "--native-color-menu-rule", READER_THEME),
    );
  });

  test("gives the Android phone's coming-soon More row no pressed look", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);
    await topBar(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: BOOK_TITLE });
    await settle(sheet);
    const row = sheet.getByRole("button", { name: "Show the file" });
    const box = await boxOf(row);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await settle(row);

    await expect(row).toHaveCSS("background-color", CLEAR);
    await page.mouse.up();
  });

  test("names the Android phone's coming-soon More row in a tooltip once a finger is held on it", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);
    await topBar(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: BOOK_TITLE });
    await settle(sheet);
    const row = sheet.getByRole("button", { name: "Show the file" });

    await holdFingerOn(page, row);

    await expect(comingSoonTooltip(page, "Show the file")).toBeVisible();
  });

  test("centres the iPhone's Light title over its sheet in a longer language", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });
    await servePages(page);
    await page.goto(`/read/${BOOK_ID}`);
    await page
      .locator("main [aria-haspopup=dialog][aria-pressed]:visible")
      .click();
    const sheet = page.getByRole("dialog");
    await settle(sheet);

    const drawn = await boxOf(sheet);
    const title = await boxOf(sheet.getByRole("heading"));

    expect(title.x + title.width / 2).toBeCloseTo(drawn.x + drawn.width / 2, 0);
  });

  test("mirrors the phone's back arrow in right-to-left text", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);

    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });

    await expect(
      topBar(page)
        .getByRole("link", { name: BACK_TO_SERIES })
        .locator("[data-icon]"),
    ).toHaveCSS("scale", MIRRORED);
  });

  test("spaces Android's bar buttons so no two 48 dp targets overlap", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBook(page);

    const overlaps = await overlappingTargets([
      topBar(page).getByRole("link", { name: BACK_TO_SERIES }),
      ...["Bookmark this page", "Reading settings", "More"].map((name) =>
        topBar(page).getByRole("button", { name, exact: true }),
      ),
    ]);

    expect(overlaps).toEqual([]);
  });

  test("keeps Android's bars up on More once Escape closes its sheet, and lets them hide when focus leaves", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBookBeforeControlsHide(page);
    const more = topBar(page).getByRole("button", { name: "More" });
    await more.click();
    const sheet = page.getByRole("dialog", { name: BOOK_TITLE });
    await expect(sheet).toBeVisible();
    await page.clock.runFor(SHEET_SLIDE_MS);
    await expect(sheet.locator(":focus")).toBeAttached();
    await page.mouse.move(
      viewportOf(page).width / 2,
      (await boxOf(sheet)).y / 2,
    );

    await page.keyboard.press("Escape");
    await page.clock.runFor(SHEET_SLIDE_MS);
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
    await page.clock.runFor(CONTROLS_HIDE_AFTER_MS + FRAME_MS);
    for (const bar of await controlBars(page).all()) {
      await expect(bar).not.toHaveClass(/opacity-0/);
    }
    await more.blur();
    await page.clock.runFor(CONTROLS_HIDE_AFTER_MS + FRAME_MS);

    await expectControlsHidden(page);
  });

  test("lets Android's bars hide again once More's sheet closes with a tap beside it", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openBookBeforeControlsHide(page);
    await topBar(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: BOOK_TITLE });
    await expect(sheet).toBeVisible();

    await page.mouse.click(
      viewportOf(page).width / 2,
      (await boxOf(sheet)).y / 2,
    );
    await page.clock.runFor(SHEET_SLIDE_MS);
    await expect(sheet).toBeHidden();
    await page.clock.runFor(CONTROLS_HIDE_AFTER_MS + FRAME_MS);

    await expectControlsHidden(page);
  });

  test("keeps one glass bar and More's sheet on a tablet", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await openBook(page);

    await expect(readerActions(page)).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Pages" })).toHaveCount(0);
    await expect(topBar(page).locator("> div")).not.toHaveCSS(
      "background-color",
      CLEAR,
    );
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("keeps the rule in More's menu on a landscape tablet", async ({
    page,
  }) => {
    await page.setViewportSize(LANDSCAPE_TABLET);
    await openBook(page);

    await page.getByRole("button", { name: "More", exact: true }).click();

    const menu = page.getByRole("menu");
    const rule = menu.getByRole("separator");
    await expect(rule).toHaveCSS(
      "border-top-color",
      await menu.evaluate((within) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--border)";
        within.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      }),
    );
    await expect(rule).toHaveCSS("margin-left", TABLET_MENU_RULE_INSET);
    await expect(rule).toHaveCSS("margin-right", TABLET_MENU_RULE_INSET);
  });
});

test.describe(
  "the iPhone's title and More menu for a long title",
  { tag: "@native" },
  () => {
    test.use({
      backend: {
        ...readerBackend(DEFAULT_BACKEND),
        openBook: () => ({
          ...readerBook(NOT_STARTED),
          title: LONG_BOOK_TITLE,
        }),
      },
    });

    test("keeps the menu no wider than iOS draws one, inside the screen, at the largest text in a longer language", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios") {
        test.skip();
        return;
      }
      await page.addInitScript(() => {
        window.localStorage.setItem("omnileaf.language", "en-XA");
      });
      await setTextScale(page, LARGEST_TEXT_SCALE);
      await servePages(page);
      await page.goto(`/read/${BOOK_ID}`);

      await page.locator("main > header [aria-haspopup=menu]:visible").click();
      const menu = page.getByRole("menu");
      await settle(menu);

      expect((await boxOf(menu)).width).toBeLessThanOrEqual(IOS_MENU_MAX_PX);
      expect(await spillsOf(menu)).toEqual([]);
    });

    test("keeps the page count whole beside the long title", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios") {
        test.skip();
        return;
      }
      await servePages(page);
      await page.goto(`/read/${BOOK_ID}`);

      const count = topBar(page)
        .getByRole("button", { name: /Jump to a book/ })
        .getByText(`· ${FIRST_PAGE}`);

      await expect(count).toBeVisible();
      expect(
        await count.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
    });
  },
);

test.describe(
  "the reader's bars on a phone over a long strip",
  { tag: "@native" },
  () => {
    test.use({
      backend: {
        ...readerBackend(DEFAULT_BACKEND),
        openBook: () => {
          const book = readerBook(NOT_STARTED);
          return {
            ...book,
            pages: book.pages.map((stripPage) => ({
              ...stripPage,
              size: STRIP_PAGE_SIZE,
            })),
          };
        },
      },
    });

    test("plays the strip from a glass button inside the iPhone's Pages capsule", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios") {
        test.skip();
        return;
      }
      await openStrip(page);

      const play = page
        .getByRole("group", { name: "Pages" })
        .getByRole("button", { name: "Start auto scroll" });
      const box = await boxOf(play);

      expect([box.width, box.height]).toEqual([
        IOS_BAR_BUTTON_PX,
        IOS_BAR_BUTTON_PX,
      ]);
      await expect(play.locator("[data-icon]")).toHaveAttribute(
        "data-icon",
        "play",
      );
    });

    test("spaces the Android phone's pager buttons so no two 48 dp targets overlap", async ({
      page,
      platform,
    }) => {
      if (platform !== "android") {
        test.skip();
        return;
      }
      await openStrip(page);

      const overlaps = await overlappingTargets([
        page.getByRole("link", { name: /^Previous chapter/ }),
        page.getByRole("button", { name: "Start auto scroll" }),
        page.getByRole("link", { name: /^Next chapter/ }),
      ]);

      expect(overlaps).toEqual([]);
    });
  },
);

test.describe(
  "the iPhone's time left in the chapter",
  { tag: "@native" },
  () => {
    test.use({
      backend: {
        ...readerBackend(DEFAULT_BACKEND),
        openBook: () => ({
          ...readerBook(NOT_STARTED),
          secondsPerPage: SECONDS_PER_PAGE,
        }),
      },
    });

    test("says the time left on a glass capsule in the bar's ink", async ({
      page,
      platform,
    }) => {
      if (platform !== "ios") {
        test.skip();
        return;
      }
      await openBook(page);

      const timeLeft = page.getByText(/left in this chapter/);

      expect(await blurOf(timeLeft)).not.toBe(NO_BLUR);
      await expect(timeLeft).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-top-bar", READER_THEME),
      );
    });
  },
);
