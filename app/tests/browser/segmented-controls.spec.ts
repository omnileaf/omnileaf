import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import type { Platform } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { expect, onPlatform, test } from "./fixtures.ts";
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
  ios: { project: "webkit-phone", target: 44 },
  android: { project: "chromium-phone", target: 48 },
  linux: { project: "chromium-desktop", target: 40 },
} as const satisfies Record<string, { project: string; target: number }>;
const TEXT_SCALES = [1, 1.3, 1.5, 2] as const;
const WIDTHS = [320, 390, 744, 1024, 1440] as const;
const HEIGHT = 844;
const ONE_ROW_WIDTHS: readonly number[] = [390, 1440];
const GLYPH_OVERSHOOT = 4;
const SAME_WIDTH = 1;
const SERIES = sampleSeries(12);

function withSeries(platform: Platform): FakeBackend {
  return {
    ...onPlatform(platform).backend,
    librarySeries: pagedSeries(() => SERIES),
    librarySeriesCount: () => SERIES.length,
  };
}

function onFirstLaunch(platform: Platform): FakeBackend {
  return { ...onPlatform(platform).backend, firstLaunchFinished: () => false };
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
      return page
        .getByRole("dialog", { name: messages.library_view })
        .getByRole("radiogroup", { name: messages.library_view_display });
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

async function scaleText(page: Page, scale: number): Promise<void> {
  await page.addInitScript(
    (css) => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      });
    },
    `:root { --text-scale: ${String(scale)} !important; }`,
  );
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
        if (document.elementFromPoint(x, y)?.closest("label") === segment) {
          tapped += 1;
        }
      }
      return tapped;
    };
    return [...track.querySelectorAll("label")].map((segment) => {
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
                  .locator("label")
                  .filter({ has: page.getByRole("radio", { checked: false }) })
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
