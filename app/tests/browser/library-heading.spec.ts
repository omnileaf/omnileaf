import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  expect,
  onPlatform,
  sidewaysOverflow,
  test,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const WIDTHS = [
  320, 360, 390, 430, 599, 600, 768, 839, 840, 1024, 1199, 1200, 1280, 1920,
];
const HEIGHT = 900;
const PHONE_WIDTHS = [360, 390, 430];
const PLATFORMS = ["ios", "android", "linux"] as const;
const LANGUAGES = { en: english, "en-XA": pseudo } as const;
const SCREENSHOT_MODE = ["on", "off"] as const;
const LIBRARIES = ["empty", "filled"] as const;
const SERIES_COUNT = 12_345;
const SERIES_COUNT_SHOWN = /12\D?345/;
const MIN_GAP = 2;

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

function countOf(page: Page): Locator {
  return headingOf(page).locator("p", { hasText: SERIES_COUNT_SHOWN }).first();
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
  for (const button of await heading.getByRole("button").all()) {
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
          test.use({ backend: backendFor(platform, library) });

          test("keeps the title and count clear of the heading's buttons at every width", async ({
            page,
          }, testInfo) => {
            test.skip(
              !testInfo.project.name.endsWith(SWEEPING_SCREEN[platform]),
              "each engine sweeps every width once, from the screen the platform runs on",
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
            await expect(headingOf(page).getByRole("button")).toHaveCount(
              library === "empty" ? 1 : 2,
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

for (const platform of PLATFORMS) {
  test.describe(`the heading's buttons on a ${platform} phone`, () => {
    test.use({ backend: backendFor(platform, "filled") });

    test("stay on the title's row beside a five-digit count, as the phone board draws them", async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.endsWith("phone"), "phone widths only");
      await page.goto("/");
      await expect(countOf(page)).toBeVisible();
      await expect(headingOf(page).getByRole("button")).toHaveCount(2);

      for (const width of PHONE_WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        const title = await boxOf(
          headingOf(page).getByRole("heading", { level: 1 }),
        );

        for (const button of await headingOf(page).getByRole("button").all()) {
          const box = await boxOf(button);
          expect(box.y, `at ${String(width)}px`).toBeLessThan(
            title.y + title.height,
          );
        }
      }
    });

    test("show Add a folder as a round icon the size of View options, each named in a tooltip", async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.endsWith("phone"), "phone widths only");
      await page.goto("/");
      const addFolder = headingOf(page).getByRole("button", {
        name: english.library_add_folder,
      });
      const viewOptions = headingOf(page).getByRole("button", {
        name: english.library_view_options,
      });

      const added = await boxOf(addFolder);
      const options = await boxOf(viewOptions);

      expect([added.width, added.height]).toEqual([
        options.width,
        options.height,
      ]);
      await expect(addFolder.getByText(english.library_add_folder)).toHaveClass(
        /sr-only/,
      );
      await expect(addFolder).toHaveAttribute(
        "title",
        english.library_add_folder,
      );
      await expect(viewOptions).toHaveAttribute(
        "title",
        english.library_view_options,
      );
    });
  });
}
