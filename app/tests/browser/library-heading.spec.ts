import { isDeepStrictEqual } from "node:util";

import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import {
  CommandFailure,
  emitFakeEvent,
  type FakeBackend,
} from "./fake-backend.ts";
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
const RESIZE_SWEEP = Array.from({ length: 41 }, (_, step) => 800 + step * 16);
const TABLET_WIDTH = 840;
const FILTERED_COUNT = 7;
const LARGEST_TEXT = ":root { --text-scale: 2 !important; }";
const LARGER_TEXT = ":root { --text-scale: 1.3 !important; }";
const CROWDED_WIDTH = 1240;
const LARGEST_TEXT_WIDTHS = [360, 375, 390, 430];
const LARGEST_TEXT_WIDE_WIDTHS = [840, 1024, 1200];
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

function isOnRowOf(box: Box, row: Box): boolean {
  const middle = centreOf(box);
  return middle > row.y && middle < row.y + row.height;
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

interface HeadingParts {
  readonly title: Box;
  readonly count: Box | undefined;
  readonly label: Box | undefined;
  readonly controls: readonly (readonly [string, Box])[];
}

/** Measures the heading's parts in one round trip, then lets two frames pass before answering, so a refit due when it measured, which waits a frame, has run before the next measure. */
async function measureHeading(
  page: Page,
  messages: typeof english,
): Promise<HeadingParts> {
  const heading = headingOf(page);
  const parts = heading
    .getByRole("heading", { level: 1 })
    .or(countOf(page))
    .or(heading.getByText(messages.screenshot_mode_title, { exact: true }))
    .or(controlsOf(heading));
  const measured = await parts.evaluateAll(async (elements) => {
    const found = elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      const kind = element.matches("h1")
        ? "title"
        : element.matches("p")
          ? "count"
          : element.matches("button, a, input")
            ? "control"
            : "label";
      const name =
        element.getAttribute("aria-label") ?? element.textContent.trim();
      return { kind, name, box: { x, y, width, height } };
    });
    await new Promise((settled) =>
      requestAnimationFrame(() => requestAnimationFrame(settled)),
    );
    return found;
  });
  const boxOfKind = (kind: string): Box | undefined =>
    measured.find((part) => part.kind === kind)?.box;
  const title = boxOfKind("title");
  if (title === undefined) {
    throw new Error("the heading has no title");
  }
  return {
    title,
    count: boxOfKind("count"),
    label: boxOfKind("label"),
    controls: measured
      .filter((part) => part.kind === "control")
      .map((part) => [part.name, part.box] as const),
  };
}

/** Measures the heading once it has settled: its fonts loaded, and no refit left to run between two measures. */
async function settledHeading(
  page: Page,
  messages: typeof english = english,
): Promise<HeadingParts> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  let measured = await measureHeading(page, messages);
  await expect
    .poll(
      async () => {
        const again = await measureHeading(page, messages);
        const isSettled = isDeepStrictEqual(again, measured);
        measured = again;
        return isSettled;
      },
      { message: "the heading settles" },
    )
    .toBe(true);
  return measured;
}

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

function crowdedParts({
  title,
  count,
  label,
  controls,
}: HeadingParts): string[] {
  const texts: (readonly [string, Box])[] = [["title", title]];
  if (count !== undefined) {
    texts.push(["count", count]);
  }
  const others = [...controls];
  if (label !== undefined) {
    others.push(["Screenshot mode label", label]);
  }
  return texts.flatMap(([textName, text]) =>
    others
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

              const parts = await settledHeading(page, messages);

              expect(
                {
                  crowded: crowdedParts(parts),
                  hasCount: parts.count !== undefined,
                  hasLabel: parts.label !== undefined,
                },
                `at ${String(width)}px`,
              ).toEqual({
                crowded: [],
                hasCount: library === "filled",
                hasLabel: screenshotMode === "on",
              });
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

            const parts = await settledHeading(page);
            const { title, count, label } = parts;
            const buttons = parts.controls.map(([, box]) => box);

            expect([count !== undefined, label !== undefined]).toEqual([
              library === "filled",
              screenshotMode === "on",
            ]);
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
            expect(crowdedParts(parts)).toEqual([]);
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

      const parts = await settledHeading(page, pseudo);

      expect(
        await linesOf(headingOf(page).getByRole("heading", { level: 1 })),
      ).toBe(1);
      expect(crowdedParts(parts)).toEqual([]);
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

      const parts = await settledHeading(page);

      expect(await linesOf(title)).toBe(1);
      const underCount =
        parts.count === undefined ? 0 : parts.count.y + parts.count.height;
      for (const [, button] of parts.controls) {
        expect(button.y).toBeGreaterThanOrEqual(underCount);
      }
      expect(crowdedParts(parts)).toEqual([]);
      expect(await sidewaysOverflow(page)).toEqual([]);
    });
  }
});

for (const platform of PLATFORMS) {
  test.describe(`the heading at the largest text size in a longer language with Screenshot mode on, wide on ${platform}`, () => {
    test.use({ backend: backendFor(platform, "filled") });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((css) => {
        localStorage.setItem("omnileaf.language", "en-XA");
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent = css;
          document.head.append(style);
        });
      }, LARGEST_TEXT);
    });

    for (const width of LARGEST_TEXT_WIDE_WIDTHS) {
      test(`keeps the title whole and nothing spilling sideways at ${String(width)}px`, async ({
        page,
      }, testInfo) => {
        test.skip(
          !testInfo.project.name.endsWith(SWEEPING_SCREEN[platform]),
          "each engine checks the width once, from the screen the platform runs on",
        );
        await openAt(page, width, "on");
        await expect(countOf(page)).toBeVisible();
        const title = headingOf(page).getByRole("heading", { level: 1 });

        const parts = await settledHeading(page, pseudo);

        expect(
          await headingOf(page).evaluate(
            (heading) => heading.scrollWidth - heading.clientWidth,
          ),
        ).toBe(0);
        expect(await linesOf(title)).toBe(1);
        expect(crowdedParts(parts)).toEqual([]);
      });
    }
  });
}

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
      const before = await settledHeading(page);

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
      const after = await settledHeading(page);
      const count = await boxOf(
        headingOf(page)
          .locator("p", { hasText: String(FILTERED_COUNT) })
          .first(),
      );

      expect(count.y).toBe(before.count?.y);
      expect(count.x).toBe(before.count?.x);
      expect(after.title).toEqual(before.title);
      const boxesOf = (parts: HeadingParts): Box[] =>
        parts.controls.map(([, box]) => box);
      expect(boxesOf(after)).toEqual(boxesOf(before));
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

for (const platform of ["ios", "linux"] as const) {
  test.describe(`the heading resized across its folds on ${platform}`, () => {
    test.use({ backend: backendFor(platform, "filled") });

    test("refits without a single page or interface error", async ({
      page,
    }, testInfo) => {
      test.skip(
        !testInfo.project.name.endsWith(SWEEPING_SCREEN[platform]),
        "each engine resizes once, from the screen the platform runs on",
      );
      test.slow(true, "resizing the window 82 times takes WebKit a while");
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });
      await page.addInitScript(() => {
        localStorage.setItem("omnileaf.language", "en-XA");
        localStorage.setItem(
          "omnileaf.screenshotMode",
          JSON.stringify({ activity: { kind: "on" } }),
        );
        const heard: string[] = [];
        Object.assign(window, { heardErrors: heard });
        window.addEventListener("error", (event) => {
          heard.push(event.message);
        });
        window.addEventListener("unhandledrejection", (event) => {
          heard.push(String(event.reason));
        });
        window.addEventListener("omnileaf:interface-error", (event) => {
          heard.push(String((event as CustomEvent).detail));
        });
      });
      await openAt(page, RESIZE_SWEEP[0] ?? 0, "on");
      await expect(countOf(page)).toBeVisible();

      for (const width of [...RESIZE_SWEEP, ...RESIZE_SWEEP.toReversed()]) {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.evaluate(
          () =>
            new Promise((settled) =>
              requestAnimationFrame(() => requestAnimationFrame(settled)),
            ),
        );
      }

      const heard = await page.evaluate(
        () => (window as unknown as { heardErrors: string[] }).heardErrors,
      );
      expect([...pageErrors, ...heard]).toEqual([]);
      expect(await sidewaysOverflow(page)).toEqual([]);
    });
  });
}

test.describe("the heading after the library empties", () => {
  let holdsSeries = true;
  const filled = backendFor("ios", "filled");
  test.use({
    backend: {
      ...filled,
      librarySeries: (after, listing) =>
        holdsSeries
          ? filled.librarySeries(after, listing)
          : { series: [], next: null },
      librarySeriesCount: () => (holdsSeries ? SERIES_COUNT : 0),
    },
  });

  test.beforeEach(() => {
    holdsSeries = true;
  });

  test("offers Add a folder with its label once the library empties", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith("phone"),
      "the screen ios sweeps from",
    );
    await page.addInitScript(() => {
      localStorage.setItem("omnileaf.language", "en-XA");
    });
    await openAt(page, TABLET_WIDTH, "off");
    await expect(countOf(page)).toBeVisible();
    const addFolder = headingOf(page).getByRole("button", {
      name: pseudo.library_add_folder,
    });
    await expect(addFolder).toHaveCount(0);

    holdsSeries = false;
    await emitFakeEvent(page, "library-changed");

    await expect(controlsOf(headingOf(page))).toHaveCount(1);
    await expect(
      addFolder.getByText(pseudo.library_add_folder),
    ).not.toHaveClass(/(^|\s)sr-only(\s|$)/);
  });

  test("sets the Screenshot mode label back beside the title once the count it gave way to goes", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith("phone"),
      "the screen ios sweeps from",
    );
    await page.addInitScript((css) => {
      localStorage.setItem("omnileaf.language", "en-XA");
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      });
    }, LARGER_TEXT);
    await openAt(page, CROWDED_WIDTH, "on");
    await expect(countOf(page)).toBeVisible();
    const title = headingOf(page).getByRole("heading", { level: 1 });
    const labelSits = async (): Promise<"beside" | "below"> => {
      const titleBox = await boxOf(title);
      const label = headingOf(page).getByText(pseudo.screenshot_mode_title, {
        exact: true,
      });
      return isOnRowOf(await boxOf(label), titleBox) ? "beside" : "below";
    };
    await expect.poll(labelSits).toBe("below");

    holdsSeries = false;
    await emitFakeEvent(page, "library-changed");
    await expect(controlsOf(headingOf(page))).toHaveCount(1);

    await expect.poll(labelSits).toBe("beside");
  });
});
