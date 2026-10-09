import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  expect,
  onPlatform,
  settle,
  sidewaysOverflow,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const WIDTHS = [
  320, 360, 390, 430, 599, 600, 768, 839, 840, 1024, 1199, 1200, 1280, 1920,
];
const HEIGHT = 900;
const PHONE_WIDTHS = [360, 375, 390, 430];
const FILTERED_COUNT = 7;
const LARGEST_TEXT = ":root { --text-scale: 2 !important; }";
const LARGEST_TEXT_WIDTHS = [360, 375, 390, 430];
const PLATFORMS = ["ios", "android", "linux"] as const;
const LANGUAGES = { en: english, "en-XA": pseudo } as const;
const SCREENSHOT_MODE = ["on", "off"] as const;
const LIBRARIES = ["empty", "filled"] as const;
const SERIES_COUNT = 12_345;
const SERIES_COUNT_SHOWN = /12\D?345/;
const MIN_GAP = 2;
const TOUCH_TARGET = 48;

type Platform = (typeof PLATFORMS)[number];
type Library = (typeof LIBRARIES)[number];
type Box = Awaited<ReturnType<typeof boxOf>>;

const SWEEPING_SCREEN = {
  ios: "phone",
  android: "phone",
  linux: "desktop",
} as const satisfies Record<Platform, string>;

function backendFor(platform: Platform, library: Library): FakeBackend {
  const { backend } = onPlatform(platform);
  if (library === "empty") {
    return backend;
  }
  return {
    ...backend,
    librarySeries: pagedSeries(() => sampleSeries(12)),
    librarySeriesCount: () => SERIES_COUNT,
    libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, showsItemCounts: true }),
  };
}

function headingOf(page: Page): Locator {
  return page
    .getByRole("main")
    .locator("header")
    .filter({ has: page.getByRole("heading", { level: 1 }) });
}

/** The heading's buttons, with the search link phones and tablets show and the search field desktops show in its place. */
function controlsOf(heading: Locator): Locator {
  return heading
    .getByRole("button")
    .or(heading.getByRole("link"))
    .or(heading.getByRole("searchbox"));
}

function countOf(page: Page): Locator {
  return headingOf(page).locator("p", { hasText: SERIES_COUNT_SHOWN }).first();
}

function centreOf(box: Box): number {
  return box.y + box.height / 2;
}

/** Whether `box` sits on the row `row` draws, its middle inside the row's height. */
function isOnRowOf(box: Box, row: Box): boolean {
  const middle = centreOf(box);
  return middle > row.y && middle < row.y + row.height;
}

function labelOf(page: Page): Locator {
  return headingOf(page).getByText(english.screenshot_mode_title, {
    exact: true,
  });
}

async function openAt(
  page: Page,
  width: number,
  screenshotMode: (typeof SCREENSHOT_MODE)[number],
): Promise<void> {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.addInitScript((screenshotMode) => {
    if (screenshotMode === "on") {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({ activity: { kind: "on" } }),
      );
    }
  }, screenshotMode);
  await page.goto("/");
}

/** The boxes of the title, its buttons and, when shown, the count and the Screenshot mode label. */
async function headingBoxes(
  page: Page,
  library: Library,
  screenshotMode: (typeof SCREENSHOT_MODE)[number],
): Promise<{
  title: Box;
  buttons: Box[];
  count: Box | undefined;
  label: Box | undefined;
}> {
  const heading = headingOf(page);
  const buttons: Box[] = [];
  for (const button of await controlsOf(heading).all()) {
    buttons.push(await boxOf(button));
  }
  return {
    title: await boxOf(heading.getByRole("heading", { level: 1 })),
    buttons,
    count: library === "filled" ? await boxOf(countOf(page)) : undefined,
    label: screenshotMode === "on" ? await boxOf(labelOf(page)) : undefined,
  };
}

/** How many lines the text of `locator` runs over. */
function linesOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set(
      [...range.getClientRects()].map((rect) => Math.round(rect.top)),
    ).size;
  });
}

function isCrowded(a: Box, b: Box): boolean {
  const apartSideways =
    a.x + a.width + MIN_GAP <= b.x || b.x + b.width + MIN_GAP <= a.x;
  const apartUpAndDown =
    a.y + a.height + MIN_GAP <= b.y || b.y + b.height + MIN_GAP <= a.y;
  return !apartSideways && !apartUpAndDown;
}

async function boxesOf(
  parts: readonly (readonly [string, Locator])[],
): Promise<[string, Box][]> {
  const boxes: [string, Box][] = [];
  for (const [name, part] of parts) {
    boxes.push([name, await boxOf(part)]);
  }
  return boxes;
}

async function crowdedParts(
  page: Page,
  messages: typeof english,
  screenshotMode: (typeof SCREENSHOT_MODE)[number],
  library: Library,
): Promise<string[]> {
  const heading = headingOf(page);
  const texts: [string, Locator][] = [
    ["title", heading.getByRole("heading", { level: 1 })],
  ];
  if (library === "filled") {
    texts.push(["count", countOf(page)]);
  }
  const others: [string, Locator][] = [];
  for (const button of await controlsOf(heading).all()) {
    const name =
      (await button.getAttribute("aria-label")) ??
      (await button.textContent())?.trim() ??
      "button";
    others.push([name, button]);
  }
  if (screenshotMode === "on") {
    others.push([
      "Screenshot mode label",
      heading.getByText(messages.screenshot_mode_title, { exact: true }),
    ]);
  }
  const textBoxes = await boxesOf(texts);
  const otherBoxes = await boxesOf(others);
  return textBoxes.flatMap(([textName, text]) =>
    otherBoxes
      .filter(([, other]) => isCrowded(text, other))
      .map(([otherName]) => `${textName} / ${otherName}`),
  );
}

for (const platform of PLATFORMS) {
  for (const [language, messages] of Object.entries(LANGUAGES)) {
    for (const screenshotMode of SCREENSHOT_MODE) {
      for (const library of LIBRARIES) {
        test.describe(`${platform} in ${language}, Screenshot mode ${screenshotMode}, ${library} library`, () => {
          testOnlyInItsWebview(platform);
          test.use({ backend: backendFor(platform, library) });

          test("keeps the title and count clear of the heading's buttons at every width", async ({
            page,
          }, testInfo) => {
            test.skip(
              !testInfo.project.name.endsWith(SWEEPING_SCREEN[platform]),
              "each platform sweeps every width once per engine it ships in, from the screen it runs on",
            );
            await page.addInitScript(
              ({ language, screenshotMode }) => {
                localStorage.setItem("omnileaf.language", language);
                if (screenshotMode === "on") {
                  localStorage.setItem(
                    "omnileaf.screenshotMode",
                    JSON.stringify({ activity: { kind: "on" } }),
                  );
                }
              },
              { language, screenshotMode },
            );
            await page.goto("/");
            await expect(controlsOf(headingOf(page))).toHaveCount(
              library === "empty" ? 1 : 3,
            );
            if (library === "filled") {
              await expect(countOf(page)).toBeVisible();
            }

            for (const width of WIDTHS) {
              await page.setViewportSize({ width, height: HEIGHT });

              expect(
                await crowdedParts(page, messages, screenshotMode, library),
                `at ${String(width)}px`,
              ).toEqual([]);
              expect(
                await sidewaysOverflow(page),
                `at ${String(width)}px`,
              ).toEqual([]);
            }
          });
        });
      }
    }
  }
}

/** Whether every button sits on one row of its own, under the title and above the count. */
function isStackedUnder(
  buttons: readonly Box[],
  title: Box,
  count: Box | undefined,
): boolean {
  const [first] = buttons;
  return (
    first !== undefined &&
    buttons.every(
      (button) =>
        isOnRowOf(button, first) && button.y >= title.y + title.height,
    ) &&
    (count === undefined || count.y >= first.y + first.height)
  );
}

for (const platform of PLATFORMS) {
  for (const screenshotMode of SCREENSHOT_MODE) {
    for (const library of LIBRARIES) {
      test.describe(`the heading on a ${platform} phone, Screenshot mode ${screenshotMode}, ${library} library`, () => {
        testOnlyInItsWebview(platform);
        test.use({ backend: backendFor(platform, library) });

        for (const width of PHONE_WIDTHS) {
          test(`keeps the buttons on the title's row and moves the count and label under it at ${String(width)}px`, async ({
            page,
          }, testInfo) => {
            test.skip(
              !testInfo.project.name.endsWith("phone"),
              "phone widths only",
            );
            await openAt(page, width, screenshotMode);
            await expect(controlsOf(headingOf(page))).toHaveCount(
              library === "empty" ? 1 : 3,
            );

            const { title, buttons, count, label } = await headingBoxes(
              page,
              library,
              screenshotMode,
            );

            const isOnTitleRow = buttons.every((button) =>
              isOnRowOf(button, title),
            );
            const isNarrowDesktopWindow =
              platform === "linux" && isStackedUnder(buttons, title, count);
            expect(isOnTitleRow || isNarrowDesktopWindow).toBe(true);
            const underTitle = title.y + title.height;
            if (count !== undefined) {
              expect(count.y).toBeGreaterThanOrEqual(underTitle);
            }
            if (label !== undefined) {
              expect(label.y).toBeGreaterThanOrEqual(underTitle);
            }
            if (count !== undefined && label !== undefined) {
              expect(isOnRowOf(label, count)).toBe(true);
              expect(label.x).toBeGreaterThan(count.x + count.width);
            }
            expect(
              await crowdedParts(page, english, screenshotMode, library),
            ).toEqual([]);
            expect(await sidewaysOverflow(page)).toEqual([]);
          });
        }
      });
    }
  }
}

for (const platform of PLATFORMS) {
  test.describe(`the heading on a ${platform} phone in a longer language`, () => {
    test.use({ backend: backendFor(platform, "filled") });

    test("keeps the title whole at 360px, without crowding or overflow", async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.endsWith("phone"), "phone widths only");
      await page.addInitScript(() => {
        localStorage.setItem("omnileaf.language", "en-XA");
      });
      await openAt(page, 360, "off");
      await expect(countOf(page)).toBeVisible();

      expect(
        await linesOf(headingOf(page).getByRole("heading", { level: 1 })),
      ).toBe(1);
      expect(await crowdedParts(page, pseudo, "off", "filled")).toEqual([]);
      expect(await sidewaysOverflow(page)).toEqual([]);
    });
  });
}

test.describe("the heading at the largest text size on an ios phone", () => {
  test.use({ backend: backendFor("ios", "filled") });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((css) => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      });
    }, LARGEST_TEXT);
  });

  for (const width of LARGEST_TEXT_WIDTHS) {
    test(`keeps the title whole and sets the buttons on a row under the title and count at ${String(width)}px`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.endsWith("phone"), "phone widths only");
      await openAt(page, width, "off");
      await expect(countOf(page)).toBeVisible();
      const title = headingOf(page).getByRole("heading", { level: 1 });

      const { buttons, count } = await headingBoxes(page, "filled", "off");

      expect(await linesOf(title)).toBe(1);
      const underCount = count === undefined ? 0 : count.y + count.height;
      for (const button of buttons) {
        expect(button.y).toBeGreaterThanOrEqual(underCount);
      }
      expect(await crowdedParts(page, english, "off", "filled")).toEqual([]);
      expect(await sidewaysOverflow(page)).toEqual([]);
    });
  }
});

test.describe("the heading as a filter changes the count", () => {
  test.use({
    backend: {
      ...backendFor("ios", "filled"),
      librarySeriesCount: (filter) =>
        filter.unread === "only" ? FILTERED_COUNT : SERIES_COUNT,
    },
  });

  for (const width of PHONE_WIDTHS) {
    test(`keeps its rows when the count shrinks from five digits to one at ${String(width)}px`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.endsWith("phone"), "phone widths only");
      await openAt(page, width, "off");
      await expect(countOf(page)).toBeVisible();
      const before = await headingBoxes(page, "filled", "off");

      await headingOf(page)
        .getByRole("button", { name: /^Filter and sort/ })
        .click();
      const panel = page.getByRole("dialog", { name: "Filter and sort" });
      await panel
        .getByRole("radiogroup", { name: "Unread" })
        .locator("label")
        .filter({ hasText: "Only" })
        .click();
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(
        headingOf(page).getByText(String(FILTERED_COUNT), { exact: true }),
      ).toBeVisible();
      const after = await boxOf(
        headingOf(page)
          .locator("p", { hasText: String(FILTERED_COUNT) })
          .first(),
      );

      expect(after.y).toBe(before.count?.y);
      expect(after.x).toBe(before.count?.x);
      const { title, buttons } = await headingBoxes(page, "empty", "off");
      expect(title).toEqual(before.title);
      expect(buttons).toEqual(before.buttons);
    });
  }
});

for (const platform of PLATFORMS) {
  test.describe(`the heading's buttons on a ${platform} phone`, () => {
    test.use({ backend: backendFor(platform, "filled") });

    test("show every heading button and the search link as a round icon of one size, each named in a tooltip", async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.endsWith("phone"), "phone widths only");
      await page.goto("/");
      const heading = headingOf(page);
      const named = [
        [
          heading.getByRole("button", { name: english.library_view_options }),
          english.library_view_options,
        ],
        [
          heading.getByRole("button", {
            name: english.library_filter_and_sort,
          }),
          english.library_filter_and_sort,
        ],
        [
          heading.getByRole("link", { name: english.search_open }),
          english.search_open,
        ],
      ] as const;
      await expect(controlsOf(heading)).toHaveCount(named.length);

      const sizes = new Set<string>();
      for (const [button] of named) {
        const box = await boxOf(button);
        sizes.add(`${String(box.width)}x${String(box.height)}`);
      }

      expect([...sizes]).toHaveLength(1);
      for (const [button, name] of named) {
        await expect(button).toHaveAttribute("title", name);
      }
    });
  });

  test.describe(`the library heading on ${platform}`, () => {
    test.describe("with books in the library", () => {
      test.use({ backend: backendFor(platform, "filled") });

      test("leaves adding folders to Settings › Library and offers View options", async ({
        page,
      }) => {
        await page.goto("/");
        await expect(countOf(page)).toBeVisible();

        const heading = headingOf(page);

        await expect(
          heading.getByRole("button", { name: english.library_view_options }),
        ).toBeVisible();
        await expect(
          heading.getByRole("button", { name: english.library_add_folder }),
        ).toHaveCount(0);
      });
    });

    test.describe("with an empty library", () => {
      test.use({ backend: backendFor(platform, "empty") });

      test("offers Add a folder beside the title", async ({ page }) => {
        await page.goto("/");

        const addFolder = headingOf(page).getByRole("button", {
          name: english.library_add_folder,
        });

        await expect(addFolder).toBeVisible();
        await expect(addFolder).toHaveAttribute(
          "title",
          english.library_add_folder,
        );
      });

      test("draws Add a folder as a round touch-sized icon on a phone", async ({
        page,
      }, testInfo) => {
        test.skip(
          !testInfo.project.name.endsWith("phone"),
          "phone widths only",
        );
        test.skip(platform === "linux", "touch platforms only");
        await page.goto("/");
        const addFolder = headingOf(page).getByRole("button", {
          name: english.library_add_folder,
        });

        const box = await boxOf(addFolder);

        expect([box.width, box.height]).toEqual([TOUCH_TARGET, TOUCH_TARGET]);
        await expect(
          addFolder.getByText(english.library_add_folder),
        ).toHaveClass(/sr-only/);
        expect(
          await addFolder.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).borderStartStartRadius),
          ),
        ).toBeGreaterThanOrEqual(TOUCH_TARGET / 2);
      });
    });

    test.describe("when the library can't be read", () => {
      test.use({
        backend: {
          ...backendFor(platform, "empty"),
          librarySeries: () => {
            throw new CommandFailure({
              code: "internal",
              message: "the library could not be read",
            });
          },
        },
      });

      test("still offers Add a folder", async ({ page }) => {
        await page.goto("/");
        await expect(
          page.getByText(english.library_series_failed),
        ).toBeVisible();

        await expect(
          headingOf(page).getByRole("button", {
            name: english.library_add_folder,
          }),
        ).toBeVisible();
      });
    });
  });
}

test.describe("the heading's search on linux", () => {
  test.use({ backend: backendFor("linux", "filled") });

  test("draws the search field's border in the colour of the buttons beside it", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith("desktop"), "desktop only");
    await page.emulateMedia({ colorScheme: "dark" });
    await openAt(page, 1280, "off");
    const heading = headingOf(page);
    const borderOf = (locator: Locator) =>
      locator.evaluate((element) => getComputedStyle(element).borderTopColor);

    const field = await borderOf(
      heading
        .getByRole("searchbox", { name: english.search_library_field })
        .locator(".."),
    );
    const viewOptions = await borderOf(
      heading.getByRole("button", { name: english.library_view_options }),
    );

    expect(field).toBe(viewOptions);
  });

  test("tints the search link under the pointer as it tints the buttons beside it", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith("desktop"), "desktop only");
    await openAt(page, 1024, "off");
    const heading = headingOf(page);
    const tintOf = async (locator: Locator) => {
      await locator.hover();
      await settle(locator);
      return locator.evaluate(
        (element) => getComputedStyle(element).backgroundImage,
      );
    };

    const link = await tintOf(
      heading.getByRole("link", { name: english.search_open }),
    );
    const viewOptions = await tintOf(
      heading.getByRole("button", { name: english.library_view_options }),
    );

    expect(viewOptions).not.toBe("none");
    expect(link).toBe(viewOptions);
  });
});
