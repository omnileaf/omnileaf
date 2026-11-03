import type { JSHandle, Page } from "@playwright/test";

import type {
  LibraryCategory,
  LibraryTab,
} from "../../src/lib/ipc/bindings.ts";
import { emitFakeEvent, type FakeBackend } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);
const NAMES = [
  "Manga",
  "Comics",
  "Plan to read",
  "Favourites",
  "Seinen",
  "Sea stories",
  "Shelved for later",
  "Borrowed from friends",
];
const NARROW_DESKTOP = 900;
const NARROWER_DESKTOP = 760;
const WIDER_DESKTOP = 1100;
const EDGE_TOLERANCE = 0.5;

interface FrameWatch {
  readonly cutFrames: string[][];
  stop: () => void;
}

let renamed: Record<string, string> = {};
let order: string[] = [];
let releaseTabs: () => void = () => undefined;
let tabsReleased: Promise<void> = Promise.resolve();

function categories(): LibraryCategory[] {
  return NAMES.map((id) => ({
    id,
    name: renamed[id] ?? id,
  })) as LibraryCategory[];
}

function savedTabs(): LibraryTab[] {
  return [
    { id: { kind: "all" }, isHidden: false },
    ...order.map((id) => ({
      id: { kind: "category" as const, id },
      isHidden: false,
    })),
  ] as LibraryTab[];
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryCategories: categories,
    libraryTabs: async () => {
      await tabsReleased;
      return savedTabs();
    },
  } satisfies FakeBackend,
});

test.beforeEach(async ({ page }) => {
  test.skip(
    viewportOf(page).width < MEDIUM_MIN_WIDTH,
    "phones scroll their tabs",
  );
  renamed = {};
  order = [];
  tabsReleased = Promise.resolve();
  await page.setViewportSize({ width: NARROW_DESKTOP, height: 800 });
});

function tabs(page: Page) {
  return page.getByRole("tablist", { name: "Categories" });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(tabs(page).getByRole("tab", { name: "All" })).toBeVisible();
}

/** Samples the strip in a task after each frame, or after the strip's own resize observers when the window resizes, so a tab drawn cut in any painted frame is recorded. */
function watchFrames(
  page: Page,
  sampling: "after each frame" | "after the strip resizes" = "after each frame",
): Promise<JSHandle<FrameWatch>> {
  return page.evaluateHandle(
    ([tolerance, isResize]) => {
      const strip = document.querySelector<HTMLElement>("[role=tablist]");
      const cutFrames: string[][] = [];
      const channel = new MessageChannel();
      let isWatching = true;
      const sample = () => {
        const bounds = strip?.getBoundingClientRect();
        const cut = [
          ...(strip?.querySelectorAll<HTMLElement>("[role=tab]") ?? []),
        ].filter((tab) => {
          const { left, right } = tab.getBoundingClientRect();
          const isDrawn = getComputedStyle(tab).visibility === "visible";
          const touchesStrip =
            bounds !== undefined && right > bounds.left && left < bounds.right;
          const isWhole =
            bounds !== undefined &&
            left >= bounds.left - tolerance &&
            right <= bounds.right + tolerance;
          return isDrawn && touchesStrip && !isWhole;
        });
        if (cut.length > 0) {
          cutFrames.push(cut.map((tab) => tab.innerText));
        }
      };
      const resizes = new ResizeObserver(sample);
      const onFrame = () => {
        channel.port2.postMessage(0);
        if (isWatching) {
          requestAnimationFrame(onFrame);
        }
      };
      if (isResize && strip !== null) {
        resizes.observe(strip);
      } else {
        channel.port1.onmessage = sample;
        requestAnimationFrame(onFrame);
      }
      return {
        cutFrames,
        stop: () => {
          isWatching = false;
          resizes.disconnect();
        },
      };
    },
    [EDGE_TOLERANCE, sampling === "after the strip resizes"] as const,
  );
}

async function expectNoCutFrame(
  page: Page,
  watch: JSHandle<FrameWatch>,
): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => {
          done();
        });
      }),
  );
  const cutFrames = await watch.evaluate((frames) => {
    frames.stop();
    return frames.cutFrames;
  });
  expect(cutFrames).toEqual([]);
}

async function expectWholeInStrip(page: Page, name: string): Promise<void> {
  const strip = await tabs(page).boundingBox();
  const tab = await tabs(page).getByRole("tab", { name }).boundingBox();
  expect(tab?.x).toBeGreaterThanOrEqual((strip?.x ?? 0) - EDGE_TOLERANCE);
  expect((tab?.x ?? 0) + (tab?.width ?? 0)).toBeLessThanOrEqual(
    (strip?.x ?? 0) + (strip?.width ?? 0) + EDGE_TOLERANCE,
  );
}

test("draws no tab cut off in any frame after choosing a tab from More", async ({
  page,
}) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "More" }).click();
  const watch = await watchFrames(page);

  await page
    .getByRole("menu")
    .getByRole("menuitemradio", { name: "Borrowed from friends" })
    .click();

  await expect(
    tabs(page).getByRole("tab", { name: "Borrowed from friends" }),
  ).toHaveAttribute("aria-selected", "true");
  await expectNoCutFrame(page, watch);
});

test("draws no tab cut off in any frame while moving to the right with the arrow keys", async ({
  page,
}) => {
  await openLibrary(page);
  const seinen = tabs(page).getByRole("tab", { name: "Seinen" });
  await seinen.click();
  await seinen.focus();
  const watch = await watchFrames(page);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");

  await expect(
    tabs(page).getByRole("tab", { name: "Shelved for later" }),
  ).toBeFocused();
  await expectNoCutFrame(page, watch);
});

test("keeps the chosen tab whole when the saved order arrives late", async ({
  page,
}) => {
  tabsReleased = new Promise((release) => {
    releaseTabs = release;
  });
  order = [...NAMES.slice(1), "Manga"];
  await openLibrary(page);
  const manga = tabs(page).getByRole("tab", { name: "Manga" });
  await manga.click();
  const watch = await watchFrames(page);

  releaseTabs();

  await expect(tabs(page).getByRole("tab").last()).toHaveText("Manga");
  await expectNoCutFrame(page, watch);
  await expectWholeInStrip(page, "Manga");
});

test("keeps the chosen tab whole when a rename makes it wider", async ({
  page,
}) => {
  await openLibrary(page);
  await tabs(page).getByRole("tab", { name: "Seinen" }).click();
  const watch = await watchFrames(page);

  renamed = { Seinen: "Seinen and other grown-up stories" };
  await emitFakeEvent(page, "library-changed");

  await expect(
    tabs(page).getByRole("tab", { name: "Seinen and other grown-up stories" }),
  ).toHaveAttribute("aria-selected", "true");
  await expectNoCutFrame(page, watch);
  await expectWholeInStrip(page, "Seinen and other grown-up stories");
});

test("keeps the chosen tab whole when the window narrows", async ({ page }) => {
  await page.setViewportSize({ width: WIDER_DESKTOP, height: 800 });
  await openLibrary(page);
  await tabs(page).getByRole("tab", { name: "Sea stories" }).click();
  const watch = await watchFrames(page, "after the strip resizes");

  await page.setViewportSize({ width: NARROWER_DESKTOP, height: 800 });

  await expect.poll(() => tabs(page).boundingBox()).not.toBeNull();
  await expectNoCutFrame(page, watch);
  await expectWholeInStrip(page, "Sea stories");
});
