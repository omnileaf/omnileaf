import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
} from "./reader-book.ts";

const FILE_NAME = `${BOOK_TITLE}.cbr`;
const typesHiddenLike: string[] = [];
const typesShownAgain: string[] = [];

const UNSUPPORTED: FakeBackend = {
  ...DEFAULT_BACKEND,
  openBook: () => {
    throw new CommandFailure({
      code: "bookTypeUnsupported",
      message: "the book's file is of a type this version can't read yet",
    });
  },
  bookPlace: () => ({
    id: BOOK_ID,
    title: BOOK_TITLE,
    series: BOOK_SERIES_ID,
    seriesTitle: BOOK_SERIES_TITLE,
  }),
  bookFile: () => ({ name: FILE_NAME, fileType: "cbr" }),
  hideFilesLike: (book) => {
    typesHiddenLike.push(book);
    return "cbr";
  },
  showFileType: (fileType) => {
    typesShownAgain.push(fileType);
    return null;
  },
};

test.use({ backend: UNSUPPORTED });

test.beforeEach(() => {
  typesHiddenLike.length = 0;
  typesShownAgain.length = 0;
});

function heading(page: Page) {
  return page.getByRole("heading", {
    level: 1,
    name: "Omnileaf can't open this file",
  });
}

async function openUnsupportedFile(page: Page): Promise<void> {
  await page.goto(`/read/${BOOK_ID}`);
  await expect(heading(page)).toBeFocused();
}

test("names the file and its type, and leaves the file where it is", async ({
  page,
}) => {
  await openUnsupportedFile(page);

  await expect(
    page.getByText(
      `${FILE_NAME} is a CBR file, which this version can't open yet. The file stays where it is.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Back to ${BOOK_SERIES_TITLE}` }),
  ).toHaveAttribute("href", `/series/${BOOK_SERIES_ID}`);
});

test("lists the files Omnileaf opens and those it doesn't yet", async ({
  page,
}) => {
  await openUnsupportedFile(page);

  await expect(
    page.getByRole("heading", { level: 2, name: "Files Omnileaf opens" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list")
      .filter({ hasText: "Folders of images" })
      .getByRole("listitem"),
  ).toHaveText(["CBZ", "CB7", "Folders of images"]);
  await expect(page.getByText("Not yet: CBR and RAR files.")).toBeVisible();
});

test("says showing the file is still to come", async ({ page }) => {
  await openUnsupportedFile(page);

  await expect(
    page.getByRole("button", {
      name: /^Show (the file|in folder) · coming soon$/,
    }),
  ).toBeDisabled();
});

test("hides files like this one, offering to undo it", async ({ page }) => {
  await openUnsupportedFile(page);
  const hide = page.getByRole("button", { name: "Hide files like this" });

  await hide.click();

  await expect(
    page.getByRole("listitem").filter({ hasText: "CBR files hidden" }),
  ).toContainText("They leave your library at the next rescan.");
  await expect(hide).toHaveAttribute("aria-disabled", "true");
  expect(typesHiddenLike).toEqual([BOOK_ID]);
  await expect(
    page.getByText("Hiding keeps CBR files out of your library from now on."),
  ).toBeVisible();
});

test("shows the type again on Undo", async ({ page }) => {
  await openUnsupportedFile(page);
  const hide = page.getByRole("button", { name: "Hide files like this" });
  await hide.click();

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(hide).not.toHaveAttribute("aria-disabled", "true");
  expect(typesShownAgain).toEqual(["cbr"]);
});

test("sets Hide and Show side by side on desktops", async ({ page }) => {
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH,
    "phones and tablets stack them",
  );
  await openUnsupportedFile(page);

  const hide = await boxOf(
    page.getByRole("button", { name: "Hide files like this" }),
  );
  const show = await boxOf(page.getByRole("button", { name: /coming soon$/ }));

  expect(show.x).toBeGreaterThan(hide.x + hide.width);
  expect(show.y).toBeCloseTo(hide.y, 0);
});

test("names the series and the file's book in a breadcrumb on desktops", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH,
    "phones and tablets show only the way back",
  );
  await openUnsupportedFile(page);

  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(
    new RegExp(`${BOOK_SERIES_TITLE}.*${BOOK_TITLE}`),
  );
});

test.describe(
  "a file Omnileaf can't open, on a phone",
  { tag: "@native" },
  () => {
    test("starts its badge and title on Android and centres them on iOS", async ({
      page,
      platform,
    }) => {
      test.skip(platform === undefined, "the native phone projects only");
      await openUnsupportedFile(page);

      const expected = platform === "ios" ? "center" : "start";
      const badge = await boxOf(page.locator('main [data-slot="empty-media"]'));
      const title = await boxOf(heading(page));

      await expect(heading(page)).toHaveCSS("text-align", expected);
      expect(title.y).toBeGreaterThanOrEqual(badge.y + badge.height);
    });

    test("stacks Hide over Show on Android, each at its own width", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "android", "Android's buttons only");
      await openUnsupportedFile(page);

      const hide = await boxOf(
        page.getByRole("button", { name: "Hide files like this" }),
      );
      const show = await boxOf(
        page.getByRole("button", { name: /coming soon$/ }),
      );

      expect(show.y).toBeGreaterThanOrEqual(hide.y + hide.height);
      expect(hide.x + hide.width / 2).toBeCloseTo(show.x + show.width / 2, 0);
      expect(hide.width).not.toBeCloseTo(show.width, 0);
    });
  },
);

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openUnsupportedFile(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
