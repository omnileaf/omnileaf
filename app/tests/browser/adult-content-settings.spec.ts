import type { Locator, Page } from "@playwright/test";

import type { AdultContent } from "../../src/lib/ipc/bindings.ts";
import { NEW_ADULT_CONTENT } from "../../src/lib/library/adult-content.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
} from "./fixtures.ts";

let stored: AdultContent = NEW_ADULT_CONTENT;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    libraryAdultContent: () => stored,
    setLibraryAdultContent: (content) => {
      stored = content;
      return null;
    },
  } satisfies FakeBackend,
});

test.beforeEach(() => {
  stored = NEW_ADULT_CONTENT;
});

function treatments(page: Page): Locator {
  return page.getByRole("radiogroup", { name: "18+ content" });
}

function ageRatings(page: Page): Locator {
  return page.getByRole("switch", {
    name: "Use age ratings from book details",
  });
}

test("opens 18+ content from Settings › Library, saying how it's treated", async ({
  page,
}) => {
  stored = { ...NEW_ADULT_CONTENT, treatment: "blur" };
  await page.goto("/settings/library");

  const link = page.getByRole("link", { name: /^18\+ content/ });
  await expect(link).toContainText("Blur covers");
  await link.click();

  await expect(page).toHaveURL(/\/settings\/library\/adult-content$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "18+ content" }),
  ).toBeVisible();
});

test("shows 18+ content and counts age ratings in a new library", async ({
  page,
}) => {
  await page.goto("/settings/library/adult-content");

  await expect(
    treatments(page).getByRole("radio", { name: "Show", exact: true }),
  ).toBeChecked();
  await expect(ageRatings(page)).toBeChecked();
});

test("keeps the treatment and the age ratings chosen", async ({ page }) => {
  await page.goto("/settings/library/adult-content");

  await treatments(page)
    .getByRole("radio", { name: "Hide", exact: true })
    .click();
  await ageRatings(page).click();
  await page.reload();

  await expect(
    treatments(page).getByRole("radio", { name: "Hide", exact: true }),
  ).toBeChecked();
  await expect(ageRatings(page)).not.toBeChecked();
  expect(stored).toEqual({ treatment: "hide", countsAgeRatings: false });
});

test("says what each choice does", async ({ page }) => {
  await page.goto("/settings/library/adult-content");

  await expect(
    treatments(page).getByRole("radio", { name: "Hide", exact: true }),
  ).toHaveAccessibleDescription(
    "Left out of the library, its counts and search.",
  );
  await expect(ageRatings(page)).toHaveAccessibleDescription(
    "Off: only series you mark 18+ by hand count.",
  );
});

test.describe("on a phone", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => fakeAppInfo("android"),
      libraryAdultContent: () => stored,
      setLibraryAdultContent: (content) => {
        stored = content;
        return null;
      },
    } satisfies FakeBackend,
  });

  test("keeps covers blurred until tapped", async ({ page }) => {
    await page.goto("/settings/library/adult-content");

    await expect(
      treatments(page).getByRole("radio", { name: "Blur covers", exact: true }),
    ).toHaveAccessibleDescription("Covers stay blurred until tapped.");
  });
});

test("keeps covers blurred until clicked on a desktop", async ({ page }) => {
  await page.goto("/settings/library/adult-content");

  await expect(
    treatments(page).getByRole("radio", { name: "Blur covers", exact: true }),
  ).toHaveAccessibleDescription("Covers stay blurred until clicked.");
});

test("has no accessibility violations", async ({ page }) => {
  await page.goto("/settings/library/adult-content");
  await expect(treatments(page)).toBeVisible();

  expect(await accessibilityViolations(page)).toEqual([]);
});
