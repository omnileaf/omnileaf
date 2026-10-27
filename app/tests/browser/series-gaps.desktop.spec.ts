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
