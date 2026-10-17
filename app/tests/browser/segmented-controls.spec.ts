import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import type { Platform } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { expect, onPlatform, settle, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

type Messages = typeof english;

interface SegmentedControl {
  readonly name: string;
  readonly hasIcons: boolean;
  readonly backend: (platform: Platform) => FakeBackend;
  readonly open: (page: Page, messages: Messages) => Promise<Locator>;
}

interface Segment {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly target: number;
  readonly hasIcon: boolean;
  readonly cutOff: readonly string[];
}

const LANGUAGES = { en: english, "en-XA": pseudo } as const;
const PLATFORMS = {
  ios: { project: "webkit-phone", target: 44, screenWidth: 390 },
  android: { project: "chromium-phone", target: 48, screenWidth: 390 },
  linux: { project: "chromium-desktop", target: 40, screenWidth: 1280 },
} as const satisfies Record<
  string,
  { project: string; target: number; screenWidth: number }
>;
const TEXT_SCALES = [1, 1.3, 1.5, 2] as const;
const WIDTHS = [320, 390, 744, 1024, 1440] as const;
const HEIGHT = 844;
const ONE_ROW_WIDTHS: readonly number[] = [390, 1440];
const GLYPH_OVERSHOOT = 4;
const SAME_WIDTH = 1;
const SERIES = sampleSeries(12);
const LARGEST_TEXT_SCALE = 2;
const CLASSIC_SCROLLBARS =
  "::-webkit-scrollbar { width: 15px; height: 15px; } ::-webkit-scrollbar-thumb { background: gray; }";
const TALL = 1600;
const SWEEP_WIDTHS = [320, 390, 600, 744, 1200, 1440] as const;

function withSeries(platform: Platform): FakeBackend {
  return {
    ...onPlatform(platform).backend,
    librarySeries: pagedSeries(() => SERIES),
    librarySeriesCount: () => SERIES.length,
  };
}

const LINKED_FOLDER = {
  id: "2",
  kind: "linked",
  name: "Sample Comics",
  location: "/media/Sample Comics",
  isAvailable: true,
} as const;

function onFirstLaunch(platform: Platform): FakeBackend {
  return {
    ...onPlatform(platform).backend,
    firstLaunchFinished: () => false,
    libraryFolders: () => ({ folders: [LINKED_FOLDER], next: null }),
  };
}

async function settingsGroup(
  page: Page,
  path: string,
  name: string,
): Promise<Locator> {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return page.getByRole("radiogroup", { name });
}

const CONTROLS: readonly SegmentedControl[] = [
  {
    name: "View options' Display",
    hasIcons: true,
    backend: withSeries,
    open: async (page, messages) => {
      await page.goto("/");
      await page
        .getByRole("main")
        .getByRole("button", { name: messages.library_view_options })
        .click();
      const options = page.getByRole("dialog", {
        name: messages.library_view_options,
      });
      await settle(options);
      return options.getByRole("radiogroup", {
        name: messages.library_view_display,
      });
    },
  },
  {
    name: "Settings › Appearance's Light or dark",
    hasIcons: false,
    backend: (platform) => onPlatform(platform).backend,
    open: (page, messages) =>
      settingsGroup(
        page,
        "/settings/appearance",
        messages.appearance_light_or_dark,
      ),
  },
  {
    name: "Settings › Privacy's Crash reports",
    hasIcons: false,
    backend: (platform) => onPlatform(platform).backend,
    open: (page, messages) =>
      settingsGroup(page, "/settings/privacy", messages.privacy_crash_reports),
  },
  {
    name: "first launch's Appearance",
    hasIcons: false,
    backend: onFirstLaunch,
    open: async (page, messages) => {
      await page.goto("/first-launch");
      for (const name of [
        messages.first_launch_get_started,
        messages.first_launch_continue,
        messages.first_launch_continue,
      ]) {
        await page
          .getByRole("main")
          .getByRole("button", { name, exact: true })
          .click();
        await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      }
      return page.getByRole("radiogroup", {
        name: messages.first_launch_choices_appearance,
      });
    },
  },
];

async function addStyle(page: Page, css: string): Promise<void> {
  await page.addInitScript((sheet) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = sheet;
      document.head.append(style);
    });
  }, css);
}

async function scaleText(page: Page, scale: number): Promise<void> {
  await addStyle(page, `:root { --text-scale: ${String(scale)} !important; }`);
}

function nextFrames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

function segmentsOf(group: Locator): Promise<Segment[]> {
  return group.evaluate((track, overshoot) => {
    track.scrollIntoView({ block: "center" });
    const origin = track.getBoundingClientRect();
    const tappedHeight = (segment: Element, box: DOMRect): number => {
      const x = box.left + box.width / 2;
      let tapped = 0;
      for (let y = Math.floor(box.top) - 32; y < box.bottom + 32; y += 1) {
        if (
          document.elementFromPoint(x, y)?.closest("[role=radio]") === segment
        ) {
          tapped += 1;
        }
      }
      return tapped;
    };
    return [...track.querySelectorAll("[role=radio]")].map((segment) => {
      const box = segment.getBoundingClientRect();
      const cutOff = [segment, ...segment.querySelectorAll("*")]
        .filter(
          (element) =>
            element.closest("[aria-hidden=true]") === null &&
            (element.scrollWidth > element.clientWidth ||
              element.scrollHeight - element.clientHeight > overshoot),
        )
        .map((element) => element.outerHTML.slice(0, 120));
      return {
        x: box.left - origin.left,
        y: box.top - origin.top,
        width: box.width,
        height: box.height,
        target: tappedHeight(segment, box),
        hasIcon: [...segment.querySelectorAll("svg")].some(
          (icon) => icon.getBoundingClientRect().width > 0,
        ),
        cutOff,
      };
    });
  }, GLYPH_OVERSHOOT);
}

function trackSpill(group: Locator): Promise<number> {
  return group.evaluate((track) => {
    const box = track.getBoundingClientRect();
    return Math.max(
      track.scrollWidth - track.clientWidth,
      box.right - document.documentElement.clientWidth,
      -box.left,
    );
  });
}

function rowsOf(segments: readonly Segment[]): Segment[][] {
  const rows = new Map<number, Segment[]>();
  for (const segment of segments) {
    const top = Math.round(segment.y);
    rows.set(top, [...(rows.get(top) ?? []), segment]);
  }
  return [...rows.values()];
}

function placesOf(segments: readonly Segment[]): string[] {
  return segments.map(
    ({ x, y, width, height }) =>
      `${x.toFixed(1)},${y.toFixed(1)} ${width.toFixed(1)}x${height.toFixed(1)}`,
  );
}

for (const [platform, { project, target }] of Object.entries(PLATFORMS)) {
  test.describe(`on ${platform}`, () => {
    for (const [language, messages] of Object.entries(LANGUAGES)) {
      for (const control of CONTROLS) {
        test.describe(`${control.name} in ${language}`, () => {
          test.use({ backend: control.backend(platform as Platform) });

          test.beforeEach(async ({ page }) => {
            await page.addInitScript((chosen) => {
              window.localStorage.setItem("omnileaf.language", chosen);
            }, language);
          });

          for (const scale of TEXT_SCALES) {
            for (const width of WIDTHS) {
              test(`shows every label whole at ${String(scale)}x text, ${String(width)}px wide`, async ({
                page,
              }, testInfo) => {
                test.skip(
                  testInfo.project.name !== project,
                  `${platform} is checked in ${project}`,
                );
                await scaleText(page, scale);
                await page.setViewportSize({ width, height: HEIGHT });
                const group = await control.open(page, messages);
                await expect(group).toBeVisible();
                await nextFrames(page);

                const segments = await segmentsOf(group);
                const rows = rowsOf(segments);
                const widths = segments.map((segment) => segment.width);
                await group
                  .getByRole("radio", { checked: false })
                  .first()
                  .click();
                await nextFrames(page);
                const afterChoosing = await segmentsOf(group);

                expect(segments.flatMap((segment) => segment.cutOff)).toEqual(
                  [],
                );
                expect(await trackSpill(group)).toBeLessThanOrEqual(0);
                for (const segment of segments) {
                  expect(segment.target).toBeGreaterThanOrEqual(target);
                  expect(segment.hasIcon).toBe(control.hasIcons);
                }
                if (rows.length > 1) {
                  expect(new Set(rows.map((row) => row.length)).size).toBe(1);
                  expect(
                    Math.max(...widths) - Math.min(...widths),
                  ).toBeLessThan(SAME_WIDTH);
                }
                if (
                  scale === 1 &&
                  language === "en" &&
                  ONE_ROW_WIDTHS.includes(width)
                ) {
                  expect(rows).toHaveLength(1);
                }
                expect(placesOf(afterChoosing)).toEqual(placesOf(segments));
              });
            }
          }
        });
      }
    }
  });
}

interface HeardErrors {
  heardErrors?: string[];
}

/** Hears a resize observer's callback changing a control's layout as an error too, since the browser only reports it once the change loops. */
async function listenForErrors(page: Page): Promise<() => Promise<string[]>> {
  const thrown: string[] = [];
  page.on("pageerror", (error) => {
    thrown.push(error.message);
  });
  await page.addInitScript(() => {
    const heard: string[] = [];
    (window as Window & HeardErrors).heardErrors = heard;
    window.addEventListener("error", (event) => heard.push(event.message));
    window.addEventListener("omnileaf:interface-error", (event) => {
      heard.push(String(event instanceof CustomEvent ? event.detail : event));
    });
    const layoutOfControls = (): string =>
      [...document.querySelectorAll("[role=radiogroup]")]
        .map(
          (group) => `${group.className}|${group.getAttribute("style") ?? ""}`,
        )
        .join("\n");
    const Observer = window.ResizeObserver;
    window.ResizeObserver = class extends Observer {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          const before = layoutOfControls();
          callback(entries, observer);
          queueMicrotask(() => {
            if (layoutOfControls() !== before) {
              heard.push(
                "a resize observer's callback changed a segmented control's layout",
              );
            }
          });
        });
      }
    };
  });
  return async () => [
    ...thrown,
    ...(await page.evaluate(
      () => (window as Window & HeardErrors).heardErrors ?? [],
    )),
  ];
}

function displayGroup(page: Page): Locator {
  return page
    .getByRole("dialog", { name: english.library_view_options })
    .getByRole("radiogroup", { name: english.library_view_display });
}

function rowsInFirstFrame(page: Page): Promise<number> {
  return page.evaluate(
    (opener) =>
      new Promise<number>((resolve) => {
        document
          .querySelector<HTMLButtonElement>(
            `main button[aria-label="${opener}"]`,
          )
          ?.click();
        requestAnimationFrame(() => {
          const segments =
            document
              .querySelector("[role=dialog][data-state=open] [role=radiogroup]")
              ?.querySelectorAll("[role=radio]") ?? [];
          resolve(
            new Set(
              [...segments].map((segment) =>
                Math.round(segment.getBoundingClientRect().top),
              ),
            ).size,
          );
        });
      }),
    english.library_view_options,
  );
}

for (const [platform, { project, screenWidth }] of Object.entries(PLATFORMS)) {
  test.describe(`View options on ${platform} at the largest text`, () => {
    test.use({ backend: withSeries(platform as Platform) });

    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== project,
        `${platform} is checked in ${project}`,
      );
      await scaleText(page, LARGEST_TEXT_SCALE);
      await page.setViewportSize({
        width: screenWidth,
        height: TALL,
      });
    });

    test("opens with the displays already in the rows they keep", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await expect(
        page
          .getByRole("main")
          .getByRole("button", { name: english.library_view_options }),
      ).toBeVisible();

      const firstFrame = await rowsInFirstFrame(page);
      await settle(
        page.getByRole("dialog", { name: english.library_view_options }),
      );
      const settled = rowsOf(await segmentsOf(displayGroup(page))).length;

      expect(settled).toBeGreaterThan(1);
      expect(firstFrame).toBe(settled);
    });

    test("raises no error while the displays wrap and unwrap beside a classic scrollbar", async ({
      page,
    }) => {
      await addStyle(page, CLASSIC_SCROLLBARS);
      const errors = await listenForErrors(page);
      await page.goto("/");
      await page
        .getByRole("main")
        .getByRole("button", { name: english.library_view_options })
        .click();
      await settle(
        page.getByRole("dialog", { name: english.library_view_options }),
      );
      const rows = rowsOf(await segmentsOf(displayGroup(page)));
      const rowStep = (rows[1]?.[0]?.y ?? 0) - (rows[0]?.[0]?.y ?? 0);
      const wrappedHeight = await page
        .getByRole("dialog", { name: english.library_view_options })
        .evaluate((dialog) => dialog.scrollHeight);
      await page.keyboard.press("Escape");
      const { width } = page.viewportSize() ?? { width: 0 };
      await page.setViewportSize({
        width,
        height: wrappedHeight - Math.round(rowStep / 2),
      });

      await page
        .getByRole("main")
        .getByRole("button", { name: english.library_view_options })
        .click();
      await nextFrames(page);
      for (const sweptWidth of [
        ...SWEEP_WIDTHS,
        ...[...SWEEP_WIDTHS].reverse(),
      ]) {
        await page.setViewportSize({
          width: sweptWidth,
          height: wrappedHeight - Math.round(rowStep / 2),
        });
        await nextFrames(page);
      }

      expect(rowStep).toBeGreaterThan(0);
      expect(await errors()).toEqual([]);
    });
  });
}
