import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const ON_PAGE_14 = {
  reading: { state: "started", page: 14 },
  startPage: 13,
} as const;

test.use({
  backend: {
    ...readerBackend(DEFAULT_BACKEND),
    openBook: () => readerBook(ON_PAGE_14),
  },
});

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function guide(page: Page): Locator {
  return page.getByRole("note", { name: /to turn pages$/ });
}

function resumeNotice(page: Page): Locator {
  return page
    .getByRole("region", { name: "Notifications F6" })
    .getByRole("listitem")
    .filter({ hasText: "Back on page 14" });
}

function setting(page: Page, name: string): Locator {
  return page.getByRole("switch", { name });
}

test.describe("the tap guide", { tag: "@native" }, () => {
  test.use({ hasSeenReaderGuide: false });

  test("is on in Settings > Reader until turned off, and then a new book opens without it", async ({
    page,
  }) => {
    await page.goto("/settings/reading");
    await expect(setting(page, "Show the tap guide")).toBeChecked();

    await setting(page, "Show the tap guide").click();
    await openBook(page);

    await expect(guide(page)).toBeHidden();
  });

  test("plays once more from Show the guide again, even with the guide off", async ({
    page,
  }) => {
    await page.goto("/settings/reading");
    await setting(page, "Show the tap guide").click();
    await page.getByRole("button", { name: "Show the guide again" }).click();
    await expect(
      page
        .getByRole("region", { name: "Notifications F6" })
        .getByText("The guide will show the next time you open a book."),
    ).toBeVisible();

    await openBook(page);
    await expect(guide(page)).toBeVisible();
    await guide(page).getByRole("button", { name: "Got it" }).click();
    await page.reload();

    await expect(
      page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
    ).toBeAttached();
    await expect(guide(page)).toBeHidden();
  });
});

test.describe("the resume notice on Android", { tag: "@native" }, () => {
  test.use({ platform: "android" });

  test("never shows, even when it was turned on before", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("omnileaf.readerHints.resumeNotice", "on");
    });

    await openBook(page);

    await expect(
      page.getByRole("img", { name: "Page 14", exact: true }),
    ).toBeVisible();
    await expect(resumeNotice(page)).toHaveCount(0);
  });
});

test.describe("the page line on Android", { tag: "@native" }, () => {
  test.use({ platform: "android" });

  test("speaks the saved page once the book opens", async ({ page }) => {
    await page.addInitScript(() => {
      const heard: string[] = [];
      Object.assign(window, { heardStatus: heard });
      new MutationObserver(() => {
        const line = document.querySelector("main > p[role='status']");
        if (line !== null && heard.at(-1) !== line.textContent) {
          heard.push(line.textContent);
        }
      }).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });

    await openBook(page);

    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { heardStatus: string[] }).heardStatus,
        ),
      )
      .toEqual(["", expect.stringContaining("14")]);
  });
});

test.describe("the resume notice", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(
      platform === "android",
      "Android opens a book quietly and has no resume notice setting",
    );
  });

  test("says where a book opened once it is turned on", async ({ page }) => {
    await page.goto("/settings/reading");
    const resume = setting(page, "Show the resume notice");
    await resume.setChecked(true);
    await expect(resume).toBeChecked();

    await openBook(page);

    await expect(resumeNotice(page)).toBeVisible();
  });

  test("opens a book quietly once it is turned off", async ({ page }) => {
    await page.goto("/settings/reading");
    const resume = setting(page, "Show the resume notice");
    await resume.setChecked(false);
    await expect(resume).not.toBeChecked();

    await openBook(page);

    await expect(
      page.getByRole("img", { name: "Page 14", exact: true }),
    ).toBeVisible();
    await expect(resumeNotice(page)).toHaveCount(0);
  });
});
