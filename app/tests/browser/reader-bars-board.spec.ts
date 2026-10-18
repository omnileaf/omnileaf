import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  LARGE_MIN_WIDTH,
  settle,
  onPlatform,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
  NOT_STARTED,
  PAGE_COUNT,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

type Box = Awaited<ReturnType<typeof boxOf>>;

const DENSE_BUTTON = 44;
const DESKTOP_BUTTON = 36;
const SETTING_WEIGHT = "500";
const ON_SETTING_WEIGHT = "600";
const SERIES_CRUMB_CAP = 220;
const POINTER_MINIMUM = 24;
const DRAWN_THUMB = 16;
const DRAWN_CRUMB_LINE = 20;
const BELOW_LARGE = { width: 1000, height: 800 };
const LONG_SERIES_TITLE = "A Series Whose Title Runs Well Past Its Crumb";

const marked: { books: readonly string[]; mark: string }[] = [];

test.use({
  backend: {
    ...readerBackend(DEFAULT_BACKEND),
    markBooks: (books, mark) => {
      marked.push({ books, mark });
      return null;
    },
  },
});

test.beforeEach(() => {
  marked.length = 0;
});

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

function isHitToItsEdges(target: Locator): Promise<boolean> {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const middle = box.left + box.width / 2;
    return [box.top + 1, box.bottom - 1].every((edge) =>
      element.contains(document.elementFromPoint(middle, edge)),
    );
  });
}

function quickSettings(page: Page): Locator {
  return page.getByRole("group", { name: "Quick settings" });
}

function direction(page: Page): Locator {
  return quickSettings(page).getByRole("button", { name: /^Left to right/ });
}

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

async function openMore(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "More", exact: true }).click();
  const more = isWide(page) ? page.getByRole("menu") : page.getByRole("dialog");
  await settle(more);
  return more;
}

test("shows AUTO on the direction button while the direction is left to the app", async ({
  page,
}) => {
  await openBook(page);

  await expect(direction(page).getByText("AUTO")).toBeVisible();
  await direction(page).click();
  await page
    .getByRole("menuitemradio", { name: "Left to right", exact: true })
    .click();

  await expect(direction(page).getByText("AUTO")).toBeHidden();
  await expect(direction(page)).toHaveAccessibleName("Left to right");
});

test("offers Automatic with the way it reads, and says the choice is remembered", async ({
  page,
}) => {
  await openBook(page);

  await direction(page).click();

  await expect(
    page.getByRole("menuitemradio", { name: "Automatic (left to right)" }),
  ).toBeChecked();
  await expect(page.getByRole("menu")).toContainText(
    `Remembered for ${BOOK_SERIES_TITLE}.`,
  );
});

test("names the series and the book with the page in the top bar", async ({
  page,
}) => {
  await openBook(page);
  const bar = page.locator("main header");

  await expect(bar).toContainText(BOOK_SERIES_TITLE);
  if (!isWide(page)) {
    await expect(bar).toContainText(
      `${BOOK_TITLE} · Page 1 of ${String(PAGE_COUNT)}`,
    );
  }
});

test("sizes the bar's buttons as the boards do", async ({ page }) => {
  await openBook(page);
  const size = isWide(page) ? DESKTOP_BUTTON : DENSE_BUTTON;

  for (const name of ["Reading settings", "More"]) {
    const box = await boxOf(page.getByRole("button", { name, exact: true }));
    expect([box.width, box.height]).toEqual([size, size]);
  }
});

test("joins the quick settings into one group of outlined buttons", async ({
  page,
}) => {
  await openBook(page);
  const buttons = quickSettings(page).getByRole("button");
  const names = isWide(page)
    ? [/^Left to right/, /^Two pages/, /^Fit height/, /^Light/]
    : [/^Left to right/, /^Two pages/, /^Light/];

  await expect(buttons).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(buttons.nth(index)).toHaveAccessibleName(name);
  }
  const first = await boxOf(buttons.nth(0));
  const second = await boxOf(buttons.nth(1));
  expect(Math.round(second.x - (first.x + first.width))).toBe(-1);
});

test("sets a quick setting's label in semibold while it is on", async ({
  page,
}) => {
  await openBook(page);
  const light = quickSettings(page).getByRole("button", { name: "Light" });

  await light.click();

  await expect(light).toHaveAttribute("aria-pressed", "true");
  await expect(light).toHaveCSS("font-weight", ON_SETTING_WEIGHT);
  await expect(direction(page)).toHaveCSS("font-weight", SETTING_WEIGHT);
});

test("keeps the direction's label medium while it reads right to left", async ({
  page,
}) => {
  await openBook(page);

  await direction(page).click();
  await page
    .getByRole("menuitemradio", { name: "Right to left", exact: true })
    .click();

  await expect(
    quickSettings(page).getByRole("button", { name: /^Right to left/ }),
  ).toHaveCSS("font-weight", SETTING_WEIGHT);
});

test.describe("in a window narrower than a large screen", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      openBook: () => ({
        ...readerBook(NOT_STARTED),
        seriesTitle: LONG_SERIES_TITLE,
      }),
    },
  });

  test("keeps the quick settings above the slider, leaving the crumbs their room", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < LARGE_MIN_WIDTH,
      "a desktop window narrowed below a large screen",
    );
    await page.setViewportSize(BELOW_LARGE);
    await openBook(page);
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });

    await expect(
      page.locator("main > header").getByRole("group", {
        name: "Quick settings",
      }),
    ).toBeHidden();
    await expect(
      page
        .locator("main > div:has(input[type=range])")
        .getByRole("group", { name: "Quick settings" })
        .getByRole("button"),
    ).toHaveText([/^\s*Left to right/, "Two pages", "Fit height", "Light"]);
    const seriesCrumb = await boxOf(
      crumbs.getByRole("link", { name: LONG_SERIES_TITLE, exact: true }),
    );
    expect(seriesCrumb.width).toBe(SERIES_CRUMB_CAP);
  });
});

test("starts the book over from More", async ({ page }) => {
  await openBook(page);
  await page.keyboard.press("End");
  await page.keyboard.press("m");

  const more = await openMore(page);
  await more
    .getByRole(isWide(page) ? "menuitem" : "button", {
      name: "Start over",
    })
    .click();

  await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
    "aria-valuetext",
    `Page 1 of ${String(PAGE_COUNT)}`,
  );
});

test("marks the book read from More", async ({ page }) => {
  await openBook(page);

  const more = await openMore(page);
  await more
    .getByRole(isWide(page) ? "menuitem" : "button", {
      name: "Mark read",
    })
    .click();

  await expect.poll(() => marked).toEqual([{ books: [BOOK_ID], mark: "read" }]);
});

test("goes back to the library from More, past the series", async ({
  page,
}) => {
  await openBook(page);

  const more = await openMore(page);
  await more
    .getByRole(isWide(page) ? "menuitem" : "link", {
      name: "Back to the library",
    })
    .click();

  await expect(page).toHaveURL(/\/$/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the reader's bars have no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openBook(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test.describe("on Android", () => {
  test.use({ backend: readerBackend(onPlatform("android").backend) });

  test("lays the bars on the surface container with no edge or blur, as Material 3 does", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openBook(page);

    const bar = page.locator("main header > div");

    await expect(bar).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
    await expect(bar).toHaveCSS(
      "background-color",
      await tokenColour(page, "--android-container"),
    );
    await expect(bar).toHaveCSS("backdrop-filter", "none");
  });
});

test("lays the page slider's track along the slider", async ({ page }) => {
  await openBook(page);
  const slider = page.getByRole("slider", { name: "Page" });
  const track = slider.locator("xpath=../div").first();

  const along = await boxOf(slider);
  const drawn = await boxOf(track);

  expect([drawn.x, drawn.width]).toEqual([along.x, along.width]);
});

test("reaches the page slider and the series crumb with a 24px pointer target though the boards draw them 16 and 20px", async ({
  page,
}) => {
  test.skip(
    !isWide(page),
    "below an expanded window the slider is drawn at a touch size and the crumbs are hidden",
  );
  await openBook(page);
  const slider = page.getByRole("slider", { name: "Page" });
  const seriesCrumb = page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link");

  const sliderTarget = await boxOf(slider);
  const thumb = await boxOf(page.locator(".reader-progress-thumb"));
  const crumbTarget = await boxOf(seriesCrumb);
  const crumbLine = await seriesCrumb.evaluate((link) => {
    const text = document.createRange();
    text.selectNodeContents(link);
    return text.getClientRects()[0]?.height ?? 0;
  });

  expect(sliderTarget.height).toBeGreaterThanOrEqual(POINTER_MINIMUM);
  expect(thumb.height).toBe(DRAWN_THUMB);
  expect(crumbTarget.height).toBeGreaterThanOrEqual(POINTER_MINIMUM);
  expect(crumbLine).toBeGreaterThan(0);
  expect(crumbLine).toBeLessThanOrEqual(DRAWN_CRUMB_LINE);
  expect(await isHitToItsEdges(slider)).toBe(true);
  expect(await isHitToItsEdges(seriesCrumb)).toBe(true);
});

test.describe("long series and book names", () => {
  const LONG_SERIES_TITLE =
    "The Lighthouse Keeper's Apprentice Spends Every Winter Alone";
  const LONG_BOOK_TITLE = "Volume 3 · Letters from Across the Northern Sea";
  const NARROW_DESKTOP = { width: 1200, height: 800 };

  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      openBook: () => ({
        ...readerBook(NOT_STARTED),
        title: LONG_BOOK_TITLE,
        seriesTitle: LONG_SERIES_TITLE,
      }),
    },
  });

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width < LARGE_MIN_WIDTH, "a desktop window");
  });

  async function openLongBook(page: Page): Promise<void> {
    await servePages(page);
    await page.goto(`/read/${BOOK_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: LONG_BOOK_TITLE }),
    ).toBeAttached();
  }

  test("keeps the book's crumb to one line, ending its title in an ellipsis before the chevron", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW_DESKTOP);
    await openLongBook(page);
    const crumb = page.locator("main header [aria-current=page]");
    const jump = crumb.getByRole("button", { name: "Jump to a book" });

    const within = await boxOf(crumb);
    const button = await boxOf(jump);
    const chevron = await boxOf(jump.locator("svg"));

    expect(button.x + button.width).toBeLessThanOrEqual(
      within.x + within.width,
    );
    expect(chevron.x + chevron.width).toBeLessThanOrEqual(
      within.x + within.width,
    );
    await expect(jump.getByText(LONG_BOOK_TITLE)).toHaveCSS(
      "text-overflow",
      "ellipsis",
    );
  });
});

test.describe("a desktop window too narrow for the breadcrumb", () => {
  const NARROW_WINDOW = { width: 800, height: 700 };

  test.beforeEach(async ({ page }) => {
    test.skip(viewportOf(page).width < LARGE_MIN_WIDTH, "a desktop window");
    await page.setViewportSize(NARROW_WINDOW);
  });

  function seriesName(page: Page): Locator {
    return page
      .locator("main header")
      .getByText(BOOK_SERIES_TITLE, { exact: true })
      .filter({ visible: true });
  }

  function middleOfText(locator: Locator): Promise<Box> {
    return locator.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      return {
        x: text.x + text.width / 4,
        y: text.y + text.height / 4,
        width: text.width / 2,
        height: text.height / 2,
      };
    });
  }

  async function coloursIn(page: Page, clip: Box): Promise<number> {
    const png = await page.screenshot({ clip, animations: "disabled" });
    return page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) =>
        character.charCodeAt(0),
      );
      const image = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("the page can't draw on a canvas");
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height);
      return new Set(new Uint32Array(pixels.data.buffer)).size;
    }, png.toString("base64"));
  }

  test("keeps the series name showing over Jump to a book while it is hovered", async ({
    page,
  }) => {
    await openBook(page);

    await page
      .locator("main header")
      .getByRole("button", { name: "Jump to a book" })
      .hover();

    const colours = await coloursIn(page, await middleOfText(seriesName(page)));
    expect(colours).toBeGreaterThan(1);
  });

  test("opens Jump to a book from a click on the series name", async ({
    page,
  }) => {
    await openBook(page);
    const name = await middleOfText(seriesName(page));

    await page.mouse.click(name.x + name.width / 2, name.y + name.height / 2);

    await expect(
      page.getByRole("dialog", { name: "Jump to a book" }),
    ).toBeVisible();
  });
});
