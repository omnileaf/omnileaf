import type { Locator, Page } from "@playwright/test";

import { boxOf, DEFAULT_BACKEND, expect, settle, test } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(9);
const PICKED = 3;

let applied: unknown;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesLabels: () => ({
      keepsLabels: true,
      categories: [
        { category: { id: "c1", name: "Reading" }, holding: PICKED },
        { category: { id: "c2", name: "Manga" }, holding: 2 },
        { category: { id: "c3", name: "Comics" }, holding: 0 },
      ],
      tags: [
        { tag: "Sea", holding: PICKED },
        { tag: "Seinen", holding: 2 },
      ],
      suggestedTags: ["Slice of life", "Letters"],
    }),
    labelSeries: (_series, changes) => {
      applied = changes;
      return null;
    },
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

test.beforeEach(() => {
  applied = undefined;
});

async function tap(target: Locator): Promise<void> {
  const touch = { pointerType: "touch", pointerId: 7, isPrimary: true };
  await target.dispatchEvent("pointerdown", touch);
  await target.dispatchEvent("pointerup", touch);
  await target.dispatchEvent("click");
}

function sheet(page: Page): Locator {
  return page.getByRole("dialog", { name: "Categories and tags" });
}

async function openLabels(page: Page): Promise<void> {
  await page.goto("/");
  const list = page.getByRole("list", { name: "Series" });
  await expect(list.getByRole("listitem")).toHaveCount(LIBRARY.length);
  await page.getByRole("button", { name: "More for the library" }).click();
  await page.getByRole("menuitem", { name: "Select series" }).click();
  await settle(list);
  for (const index of [0, 1, 2]) {
    await tap(list.getByRole("checkbox").nth(index));
  }
  await expect(page.getByText("3 selected").first()).toBeVisible();
  await settle(page.getByRole("group", { name: "Selected series" }));
  await tap(page.getByRole("button", { name: "Categories" }));
  await expect(sheet(page)).toBeVisible();
}

test.describe("labelling series on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "ios", "iOS's sheet");
  });

  test("puts Close, the title and a filled Done in the sheet's bar", async ({
    page,
  }) => {
    await openLabels(page);

    const bar = await Promise.all(
      ["Close", "Done"].map(async (name) =>
        boxOf(sheet(page).getByRole("button", { name, exact: true })),
      ),
    );
    const title = await boxOf(
      sheet(page).getByRole("heading", { name: "Categories and tags" }),
    );
    const [close, done] = bar;
    expect(close?.x).toBeLessThan(title.x);
    expect(title.x).toBeLessThan(done?.x ?? 0);
    await expect(
      sheet(page).getByRole("button", { name: "Done", exact: true }),
    ).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(sheet(page).getByRole("button", { name: "Done" })).toHaveCount(
      1,
    );
  });

  test("marks a category some of the series hold with a dash and says how many", async ({
    page,
  }) => {
    await openLabels(page);

    await expect(sheet(page).getByText("2 of the 3 are in it")).toBeVisible();
    await expect(
      sheet(page).getByRole("checkbox", { name: /^Manga/ }),
    ).toHaveAttribute("aria-checked", "mixed");
  });

  test("fills the chosen and dashed circles in Done's green and sets the suggestions in ink", async ({
    page,
  }) => {
    await openLabels(page);

    const done = await sheet(page)
      .getByRole("button", { name: "Done", exact: true })
      .evaluate((button) => getComputedStyle(button).backgroundColor);
    const ink = await page.evaluate(
      () => getComputedStyle(document.body).color,
    );
    for (const name of ["Reading", /^Manga/]) {
      await expect(sheet(page).getByRole("checkbox", { name })).toHaveCSS(
        "background-color",
        done,
      );
    }
    await expect(
      sheet(page).getByRole("button", { name: "Add Letters" }),
    ).toHaveCSS("color", ink);
  });

  test("sets the categories in one grouped card with New category as its last row", async ({
    page,
  }) => {
    await openLabels(page);

    const { readingTop, addingTop, width } = await sheet(page).evaluate(
      (root) => {
        const top = (selector: string): number =>
          root.querySelector(selector)?.getBoundingClientRect().top ?? NaN;
        return {
          readingTop: top('[role="checkbox"]'),
          addingTop: top('input[placeholder="New category"]'),
          width:
            root.querySelector('[role="checkbox"]')?.getBoundingClientRect()
              .width ?? NaN,
        };
      },
    );
    expect(addingTop).toBeGreaterThan(readingTop);
    expect(width).toBeCloseTo(22, 0);
    const isRound = await sheet(page)
      .getByRole("checkbox", { name: "Reading" })
      .evaluate(
        (box) =>
          parseFloat(getComputedStyle(box).borderTopLeftRadius) >=
          box.clientWidth / 2,
      );
    expect(isRound).toBe(true);
  });

  test("applies the choices, a new tag and a removed tag when Done is tapped", async ({
    page,
  }) => {
    await openLabels(page);

    await tap(sheet(page).getByRole("checkbox", { name: "Comics" }));
    await tap(sheet(page).getByRole("button", { name: "Add Letters" }));
    await tap(sheet(page).getByRole("button", { name: "Remove Sea" }));
    await tap(sheet(page).getByRole("button", { name: "Done", exact: true }));

    await expect(sheet(page)).toHaveAttribute("data-state", "closed");
    expect(applied).toEqual({
      categoriesAdded: ["c3"],
      categoriesRemoved: [],
      categoriesCreated: [],
      tagsAdded: ["Letters"],
      tagsRemoved: ["Sea"],
    });
  });

  test("closes with Close and applies nothing", async ({ page }) => {
    await openLabels(page);

    await tap(sheet(page).getByRole("button", { name: "Close", exact: true }));

    await expect(sheet(page)).toHaveAttribute("data-state", "closed");
    expect(applied).toBeUndefined();
  });
});
