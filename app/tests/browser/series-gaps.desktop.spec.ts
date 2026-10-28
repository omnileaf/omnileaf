import type { Page } from "@playwright/test";

import { accessibilityViolations, expect, test } from "./fixtures.ts";
import {
  chapters,
  SectionShelf,
  type ShelvedBook,
  volumes,
} from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const SUMMER_SHORT: ShelvedBook = { kind: "special", title: "Summer Short" };
const READ_VOLUME_ONE: ShelvedBook = {
  kind: "volume",
  numbers: { first: 1, last: 1 },
  reading: { state: "read" },
};
const MISSING = [{ first: 5, last: 6 }];
const GAP_NAME = "Volumes 5 and 6 are not in the folder";

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

function kinds(page: Page) {
  return page.getByRole("tablist", { name: "Kinds of book" });
}

test.describe("a series missing two volumes", () => {
  const shelf = new SectionShelf(
    [
      READ_VOLUME_ONE,
      ...volumes(2, 3, 4, 7),
      ...chapters(99, 100),
      SUMMER_SHORT,
    ],
    MISSING,
  );
  test.use({ backend: shelf.backend() });

  test("shows the volumes as covers named by their numbers", async ({
    page,
  }) => {
    await openSeries(page);

    const covers = page.getByRole("list", { name: "Volumes" });
    await expect(covers.getByRole("link")).toHaveText([
      /Volume 1\s*Read$/,
      /Volume 2\s*Unread$/,
      /Volume 3\s*Unread$/,
      /Volume 4\s*Unread$/,
      /Volume 7\s*Unread$/,
    ]);
  });

  test("holds the missing volumes' place with a gap Tab steps over", async ({
    page,
  }) => {
    await openSeries(page);
    const covers = page.getByRole("list", { name: "Volumes" });

    await covers.getByRole("link", { name: "Volume 4" }).focus();
    await page.keyboard.press("Tab");

    await expect(covers.getByRole("listitem").nth(4)).toContainText(
      "Volumes 5–6",
    );
    await expect(covers.getByRole("img", { name: GAP_NAME })).toBeVisible();
    await expect(covers.getByRole("link", { name: "Volume 7" })).toBeFocused();
  });

  test("says why the gap is there", async ({ page }) => {
    await openSeries(page);

    await expect(
      page.getByText(
        "Volumes 5 and 6 aren’t in the folder. The gap keeps the others in place.",
      ),
    ).toBeVisible();
  });

  test("shows the specials as covers with where they come from", async ({
    page,
  }) => {
    await openSeries(page);

    await kinds(page).getByRole("tab", { name: "Specials" }).click();

    await expect(
      page.getByRole("list", { name: "Specials" }).getByRole("link"),
    ).toHaveText([/Summer Short\s*Unread$/]);
    await expect(
      page.getByText("Extras from the series’ Specials folder"),
    ).toBeVisible();
  });

  test("moves between the tabs with the arrow keys", async ({ page }) => {
    await openSeries(page);

    await kinds(page).getByRole("tab", { name: "Volumes" }).focus();
    await page.keyboard.press("ArrowRight");

    await expect(
      kinds(page).getByRole("tab", { name: "Chapters" }),
    ).toBeFocused();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    for (const tab of ["Volumes", "Chapters", "Specials"] as const) {
      test(`the ${tab} tab has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openSeries(page);
        await kinds(page).getByRole("tab", { name: tab }).click();
        await expect(
          kinds(page).getByRole("tab", { name: tab }),
        ).toHaveAttribute("aria-selected", "true");
        await expect(
          page.getByRole("tabpanel").getByRole("link").first(),
        ).toBeVisible();

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    }
  }

  test("keeps the chapters after the last volume in the books table", async ({
    page,
  }) => {
    await openSeries(page);

    await kinds(page).getByRole("tab", { name: "Chapters" }).click();

    await expect(
      page.getByRole("table", { name: "Books" }).getByRole("link"),
    ).toHaveCount(2);
    await expect(page.getByText("The chapters after Volume 7.")).toBeVisible();
    await expect(page.getByRole("img", { name: GAP_NAME })).toHaveCount(0);
  });
});

test.describe("finding and sorting a series' volumes", () => {
  const shelf = new SectionShelf(
    [...volumes(1, 4, 7, 17), ...chapters(99)],
    [
      { first: 2, last: 3 },
      { first: 5, last: 6 },
      { first: 8, last: 16 },
    ],
  );
  test.use({ backend: shelf.backend() });

  test("finds a volume by its number and drops the gaps", async ({ page }) => {
    await openSeries(page);
    const covers = page.getByRole("list", { name: "Volumes" });

    await page.getByRole("searchbox", { name: "Find a book" }).fill("7");

    await expect(covers.getByRole("link")).toHaveText([
      /Volume 7\s*Unread$/,
      /Volume 17\s*Unread$/,
    ]);
    await expect(page.getByRole("img", { name: GAP_NAME })).toHaveCount(0);
  });

  test("says when no volume matches", async ({ page }) => {
    await openSeries(page);

    await page.getByRole("searchbox", { name: "Find a book" }).fill("Volume 9");

    await expect(
      page.getByText("No book in this series matches “Volume 9”."),
    ).toBeVisible();
  });

  test("puts the last volume first with the gap after the later one", async ({
    page,
  }) => {
    await openSeries(page);

    await page.getByRole("button", { name: "Sort: In order" }).click();
    await page.getByRole("menuitemradio", { name: "Last first" }).click();

    const items = page
      .getByRole("list", { name: "Volumes" })
      .getByRole("listitem");
    await expect(items).toHaveText([
      /Volume 17/,
      /Volumes 8–16/,
      /Volume 7/,
      /Volumes 5–6/,
      /Volume 4/,
      /Volumes 2–3/,
      /Volume 1/,
    ]);
  });
});

test.describe("a series counted into double figures", () => {
  const shelf = new SectionShelf([
    ...volumes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
    ...chapters(97, 98, 99, 100, 101, 102),
    SUMMER_SHORT,
    { kind: "special", title: "Art book" },
  ]);
  test.use({ backend: shelf.backend() });

  test("keeps Find a book and Sort on the tabs' row", async ({ page }) => {
    await openSeries(page);

    const tabs = await kinds(page).boundingBox();
    const search = await page
      .getByRole("searchbox", { name: "Find a book" })
      .boundingBox();

    expect(search?.y).toBeLessThan((tabs?.y ?? 0) + (tabs?.height ?? 0));
  });
});

test.describe("a series of volumes only", () => {
  const shelf = new SectionShelf(volumes(1, 2, 4), [{ first: 3, last: 3 }]);
  test.use({ backend: shelf.backend() });

  test("shows its covers and gap without tabs", async ({ page }) => {
    await openSeries(page);

    await expect(
      page.getByRole("img", { name: "Volume 3 is not in the folder" }),
    ).toBeVisible();
    await expect(kinds(page)).toHaveCount(0);
  });
});

test.describe("moving from one series to another like it", () => {
  const OTHER_SERIES = {
    id: "0190a3e4-0000-8000-8000-0000000000b2",
    title: "Sample Series 12",
  };
  const shelf = new SectionShelf(volumes(1, 2, 3));
  const backend = shelf.backend();
  test.use({
    backend: {
      ...backend,
      seriesOverview: async (id) => {
        const overview = await backend.seriesOverview(SERIES_ID);
        return id === OTHER_SERIES.id
          ? { ...overview, ...OTHER_SERIES }
          : {
              ...overview,
              related: [
                {
                  ...OTHER_SERIES,
                  cover: null,
                  bookCount: 3,
                  readCount: 0,
                  reason: { kind: "sameWriter" },
                  isAdult: false,
                },
              ],
            };
      },
      seriesBooks: (_id, listing, after) =>
        backend.seriesBooks(SERIES_ID, listing, after),
    },
  });

  test("opens the next series without the last one's search", async ({
    page,
  }) => {
    await openSeries(page);
    await page.getByRole("searchbox", { name: "Find a book" }).fill("2");
    await expect(
      page.getByRole("list", { name: "Volumes" }).getByRole("link"),
    ).toHaveCount(1);

    await page
      .getByRole("region", { name: "Also in your library" })
      .getByRole("link", { name: new RegExp(OTHER_SERIES.title) })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: OTHER_SERIES.title }),
    ).toBeVisible();

    await expect(
      page.getByRole("searchbox", { name: "Find a book" }),
    ).toHaveValue("");
    await expect(
      page.getByRole("list", { name: "Volumes" }).getByRole("link"),
    ).toHaveCount(3);
  });
});
