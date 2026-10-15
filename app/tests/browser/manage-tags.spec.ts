import type { Locator, Page } from "@playwright/test";

import type { LibraryTag } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

const SEINEN_SERIES = ["0190a3e4-0000-8000-8000-000000000004"];
const FIRST_TAGS: readonly LibraryTag[] = [
  { name: "Slice of life", seriesCount: 12 },
  { name: "Seinen", seriesCount: 1 },
  { name: "Sea", seriesCount: 3 },
];

let tags: LibraryTag[] = [...FIRST_TAGS];
let tagsPutBack: readonly string[] | undefined;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    libraryTags: () => tags,
    renameLibraryTag: (tag, to) => {
      tags = tags.map((one) => (one.name === tag ? { ...one, name: to } : one));
      return null;
    },
    removeLibraryTag: (tag) => {
      tags = tags.filter((one) => one.name !== tag);
      return tag === "Seinen" ? SEINEN_SERIES : [];
    },
    labelSeries: (_series, changes) => {
      tagsPutBack = changes.tagsAdded;
      return null;
    },
  } satisfies FakeBackend,
});

test.beforeEach(() => {
  tags = [...FIRST_TAGS];
  tagsPutBack = undefined;
});

function tagList(page: Page): Locator {
  return page.getByRole("list", { name: "Tags" });
}

function rowOf(page: Page, tag: string): Locator {
  return tagList(page).getByRole("listitem").filter({ hasText: tag });
}

test("lists every tag with how many series carry it", async ({ page }) => {
  await page.goto("/settings/library/tags");

  await expect(tagList(page).getByRole("listitem")).toHaveCount(3);
  await expect(rowOf(page, "Slice of life")).toContainText("12 series");
  await expect(page.getByText("3 tags.", { exact: false })).toBeVisible();
});

test("finds a tag by what's typed", async ({ page }) => {
  await page.goto("/settings/library/tags");

  await page.getByRole("searchbox", { name: "Find a tag" }).fill("se");

  await expect(tagList(page).getByRole("listitem")).toHaveText([
    /Seinen/,
    /Sea/,
  ]);
});

test("renames a tag", async ({ page }) => {
  await page.goto("/settings/library/tags");

  await rowOf(page, "Sea").getByRole("button", { name: "Rename Sea" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename Sea" });
  await dialog.getByRole("textbox", { name: "Tag" }).fill("Ocean");
  await dialog.getByRole("button", { name: "Rename" }).click();

  await expect(dialog).toBeHidden();
  await expect(rowOf(page, "Ocean")).toBeVisible();
});

test("deletes a tag at once, and puts it back with Undo", async ({ page }) => {
  await page.goto("/settings/library/tags");

  await rowOf(page, "Seinen")
    .getByRole("button", { name: "Delete Seinen" })
    .click();
  await expect(rowOf(page, "Seinen")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();

  await expect.poll(() => tagsPutBack).toEqual(["Seinen"]);
});

test("says when the library keeps no tags yet", async ({ page }) => {
  tags = [];
  await page.goto("/settings/library/tags");

  await expect(page.getByText("No tags yet.", { exact: false })).toBeVisible();
});

test("opens Manage tags from Settings › Library, saying how many tags there are", async ({
  page,
}) => {
  await page.goto("/settings/library");

  const link = page.getByRole("link", { name: /^Manage tags/ });
  await expect(link).toContainText("3 tags");
  await link.click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Manage tags" }),
  ).toBeVisible();
});

test("has no accessibility violations", async ({ page }) => {
  await page.goto("/settings/library/tags");
  await expect(tagList(page)).toBeVisible();

  expect(await accessibilityViolations(page)).toEqual([]);
});
