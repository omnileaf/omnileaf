import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import {
  BOOK_SERIES_ID,
  BOOK_SERIES_TITLE,
  openLongStrip,
  tallStripBackend,
} from "./reader-book.ts";

const SHARED_KEY = "omnileaf.readerSettings.all";
const SERIES_KEY = `omnileaf.readerSettings.series.${BOOK_SERIES_ID}`;

test.use({ backend: tallStripBackend(DEFAULT_BACKEND) });

interface StoredSpeeds {
  readonly shared: number;
  readonly series?: number;
}

async function openStrip(page: Page, speeds: StoredSpeeds): Promise<void> {
  const shared = { autoScrollSpeed: "set", screensPerMinute: speeds.shared };
  const own =
    speeds.series === undefined
      ? {}
      : { [SERIES_KEY]: JSON.stringify({ screensPerMinute: speeds.series }) };
  await page.clock.install();
  await openLongStrip(page, { [SHARED_KEY]: JSON.stringify(shared), ...own });
}

async function openSpeed(page: Page): Promise<Locator> {
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
  return page
    .getByRole("dialog", { name: "Reading settings" })
    .getByRole("region", { name: "Auto scroll" });
}

function speedIn(text: string | null): unknown {
  const stored: unknown = JSON.parse(text ?? "{}");
  return typeof stored === "object" &&
    stored !== null &&
    "screensPerMinute" in stored
    ? stored.screensPerMinute
    : undefined;
}

async function storedSpeeds(
  page: Page,
): Promise<{ shared: unknown; series: unknown }> {
  const stored = await page.evaluate(
    ({ sharedKey, seriesKey }) => ({
      shared: localStorage.getItem(sharedKey),
      series: localStorage.getItem(seriesKey),
    }),
    { sharedKey: SHARED_KEY, seriesKey: SERIES_KEY },
  );
  return { shared: speedIn(stored.shared), series: speedIn(stored.series) };
}

test.describe(
  "The long strip's auto scroll speed on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's reading settings sheet");
    });

    test("saves a new speed for this series only, as its line says", async ({
      page,
    }) => {
      await openStrip(page, { shared: 3 });
      const speed = await openSpeed(page);

      await expect(
        speed.getByRole("radio", { name: "This series" }),
      ).toHaveAttribute("aria-checked", "true");
      await expect(speed).toContainText(
        `Saved for ${BOOK_SERIES_TITLE} only. From 1 to 12 screens a minute; the default is 3.`,
      );
      await speed.getByRole("slider", { name: "Screens a minute" }).focus();
      await page.keyboard.press("ArrowRight");

      await expect(speed).toContainText("Screens a minute: 4");
      expect(await storedSpeeds(page)).toEqual({ shared: 3, series: 4 });
    });

    test("saves the speed for every series once All series is chosen", async ({
      page,
    }) => {
      await openStrip(page, { shared: 3, series: 5 });
      const speed = await openSpeed(page);

      await speed.getByRole("radio", { name: "All series" }).click();

      await expect(speed).toContainText(
        "Saved for every series. From 1 to 12 screens a minute; the default is 5.",
      );
      expect(await storedSpeeds(page)).toEqual({
        shared: 5,
        series: undefined,
      });
    });

    test("goes back to every series' speed with Use the default", async ({
      page,
    }) => {
      await openStrip(page, { shared: 3, series: 7 });
      const speed = await openSpeed(page);
      await expect(speed).toContainText("Screens a minute: 7");

      await speed.getByRole("button", { name: "Use the default (3)" }).click();

      await expect(speed).toContainText("Screens a minute: 3");
      expect(await storedSpeeds(page)).toEqual({
        shared: 3,
        series: undefined,
      });
    });

    test("keeps All series chosen when the speed opens again", async ({
      page,
    }) => {
      await openStrip(page, { shared: 3, series: 5 });
      await (
        await openSpeed(page)
      )
        .getByRole("radio", { name: "All series" })
        .click();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Reading settings" }),
      ).toBeHidden();

      const speed = await openSpeed(page);

      await expect(
        speed.getByRole("radio", { name: "All series" }),
      ).toHaveAttribute("aria-checked", "true");
      await expect(speed).toContainText("Saved for every series.");
    });

    test("keeps Faster on the toolbar to a series with no speed of its own", async ({
      page,
    }) => {
      await openStrip(page, { shared: 3 });
      await page.getByRole("button", { name: "Show the controls" }).click();
      await page.getByRole("button", { name: "Start auto scroll" }).click();
      const bar = page.getByRole("region", { name: "Auto scroll" });

      await bar.getByRole("button", { name: "Faster" }).click();

      await expect(bar).toContainText("4 screens a minute");
      expect(await storedSpeeds(page)).toEqual({ shared: 3, series: 4 });
    });

    test("keeps Faster on the toolbar to this series' own speed", async ({
      page,
    }) => {
      await openStrip(page, { shared: 3, series: 5 });
      await page.getByRole("button", { name: "Show the controls" }).click();
      await page.getByRole("button", { name: "Start auto scroll" }).click();
      const bar = page.getByRole("region", { name: "Auto scroll" });

      await bar.getByRole("button", { name: "Faster" }).click();

      await expect(bar).toContainText("6 screens a minute");
      expect(await storedSpeeds(page)).toEqual({ shared: 3, series: 6 });
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations with the speed showing in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openStrip(page, { shared: 3, series: 5 });
        const speed = await openSpeed(page);
        await speed
          .getByRole("button", { name: "Use the default (3)" })
          .scrollIntoViewIfNeeded();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);
