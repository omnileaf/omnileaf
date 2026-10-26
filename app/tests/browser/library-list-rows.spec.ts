import type { Locator, Page } from "@playwright/test";

import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const TABLET = { width: 820, height: 1180 };

const ROW_TITLE_SIZE = { ios: "17px", android: "16px" } as const;
const RULE = {
  ios: { colour: "rgba(60, 60, 67, 0.12)", height: "1px" },
  android: { colour: "rgba(0, 0, 0, 0)", height: "0px" },
} as const;

interface RowLook {
  readonly titleSize: string;
  readonly rule: { readonly colour: string; readonly height: string };
  readonly ruleStart: number;
  readonly titleStart: number;
  readonly edgeWidth: string;
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => sampleSeries(6)),
    librarySeriesCount: () => 6,
    libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, display: "list" }),
  },
});

function rows(page: Page): Locator {
  return page.getByRole("list", { name: "Series" }).getByRole("listitem");
}

async function secondRowLook(page: Page): Promise<RowLook> {
  await page.goto("/");
  const row = rows(page).nth(1).locator("[data-series-id]");
  await expect(row).toBeVisible();
  return row.evaluate((element) => {
    const title = element.querySelector("[data-slot=item-title]");
    const rule = getComputedStyle(element, "::after");
    const rowStart = element.getBoundingClientRect().left;
    return {
      titleSize: title === null ? "" : getComputedStyle(title).fontSize,
      rule: { colour: rule.backgroundColor, height: rule.height },
      ruleStart: rowStart + parseFloat(rule.left),
      titleStart: title?.getBoundingClientRect().left ?? Number.NaN,
      edgeWidth: getComputedStyle(element).borderBlockEndWidth,
    };
  });
}

test.describe("the library's list view on a phone", { tag: "@native" }, () => {
  test("sets each row's title as the phone's own list row does", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }

    const look = await secondRowLook(page);

    expect(look.titleSize).toBe(ROW_TITLE_SIZE[platform]);
    expect(look.edgeWidth).toBe("0px");
  });

  test("rules rows apart on an iPhone and leaves them unruled on android", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }

    const look = await secondRowLook(page);

    expect(look.rule).toEqual(RULE[platform]);
    if (platform === "ios") {
      expect(look.ruleStart).toBeCloseTo(look.titleStart, 0);
    }
  });

  test("keeps today's ruled rows on a tablet", async ({ page }) => {
    await page.setViewportSize(TABLET);

    const look = await secondRowLook(page);

    expect(look.edgeWidth).toBe("1px");
  });
});
