import type { Page } from "@playwright/test";

import type { VersionNotes, WhatsNew } from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  FAKE_APP_VERSION,
  onPlatform,
  test,
} from "./fixtures.ts";

const ABOUT_PAGE = "/settings/about";
const WHATS_NEW_PAGE = "/settings/about/whats-new";

const INSTALLED: VersionNotes = {
  version: FAKE_APP_VERSION,
  entries: [
    { kind: "fix", summary: "Back closes an open sheet on Android" },
    { kind: "feat", summary: "Series pages show their sections as tabs" },
    { kind: "perf", summary: "Covers load sooner in a large library" },
    { kind: "feat", summary: "Search remembers the filters you used last" },
    { kind: "sec", summary: "Shares refuse plain HTTP" },
    { kind: "breaking", summary: "Backups from before 1.0 no longer open" },
  ],
};

const EARLIER: VersionNotes = {
  version: "1.2.2",
  entries: [{ kind: "fix", summary: "Covers no longer flicker" }],
};

const FIRST: VersionNotes = {
  version: "1.2.0",
  entries: [{ kind: "feat", summary: "Read comics from your folders" }],
};

function backendWith(whatsNew: WhatsNew) {
  return { backend: { ...DEFAULT_BACKEND, whatsNew: () => whatsNew } };
}

function textStart(element: Element): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect().x;
}

function whatsNewRow(page: Page) {
  return page.getByRole("main").getByRole("link", { name: /^What’s new/ });
}

test.describe("What’s new on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android phones' What’s new");
  });

  test.describe("with notes for this version only", () => {
    test.use(backendWith({ installed: INSTALLED, earlier: [] }));

    test("leads About with What’s new, naming this version's notes", async ({
      page,
    }) => {
      await page.goto(ABOUT_PAGE);

      const first = page.getByRole("main").getByRole("listitem").first();
      await expect(first).toContainText("What’s new");
      await expect(
        whatsNewRow(page).getByText(`Notes for ${FAKE_APP_VERSION}`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        whatsNewRow(page).locator("[data-icon=sparkles]"),
      ).toHaveCount(1);
    });

    test("opens this version's notes grouped by kind in the changelog's order", async ({
      page,
    }) => {
      await page.goto(ABOUT_PAGE);

      await whatsNewRow(page).click();

      await expect(page).toHaveURL(WHATS_NEW_PAGE);
      await expect(
        page.getByRole("heading", { level: 1, name: "What’s new" }),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByRole("heading", { level: 2 }),
      ).toHaveText([
        `Breaking changes in ${FAKE_APP_VERSION}`,
        `Security fixes in ${FAKE_APP_VERSION}`,
        `New in ${FAKE_APP_VERSION}`,
        `Faster in ${FAKE_APP_VERSION}`,
        `Fixed in ${FAKE_APP_VERSION}`,
      ]);
      await expect(
        page
          .getByRole("region", { name: `New in ${FAKE_APP_VERSION}` })
          .getByRole("listitem"),
      ).toHaveText([
        "Series pages show their sections as tabs",
        "Search remembers the filters you used last",
      ]);
    });

    test("sets each group's heading 16px in and its notes 36px in, as the board does", async ({
      page,
    }) => {
      await page.goto(WHATS_NEW_PAGE);

      const starts = await Promise.all(
        [
          page.getByRole("heading", { name: `Fixed in ${FAKE_APP_VERSION}` }),
          page.getByText("Back closes an open sheet on Android", {
            exact: true,
          }),
        ].map((shown) => shown.evaluate(textStart)),
      );

      expect(starts).toEqual([16, 36]);
    });

    test("goes back to About", async ({ page }) => {
      await page.goto(WHATS_NEW_PAGE);

      await page.getByRole("link", { name: "Back to About" }).click();

      await expect(page).toHaveURL(ABOUT_PAGE);
    });

    test("keeps the notes in English in another language", async ({ page }) => {
      await page.addInitScript(() => {
        window.localStorage.setItem("omnileaf.language", "en-XA");
      });

      await page.goto(WHATS_NEW_PAGE);

      await expect(page.getByRole("heading", { level: 1 })).toContainText("⟦");
      const note = page
        .getByRole("main")
        .getByText("Shares refuse plain HTTP", { exact: true });
      await expect(note).toHaveAttribute("lang", "en");
      await expect(note).toHaveAttribute("dir", "ltr");
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(WHATS_NEW_PAGE);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  });

  test.describe("with notes for earlier versions too", () => {
    test.use(backendWith({ installed: INSTALLED, earlier: [EARLIER, FIRST] }));

    test("lists the earlier versions under this version's notes, newest first, each summed up", async ({
      page,
    }) => {
      await page.goto(WHATS_NEW_PAGE);
      const earlier = page.getByRole("region", { name: "Earlier versions" });

      await expect(
        page.getByRole("main").getByRole("heading", { level: 2 }).last(),
      ).toHaveText("Earlier versions");
      await expect(earlier.getByRole("link")).toHaveText([
        /^\s*1\.2\.2\s*Fixes only\s*$/,
        /^\s*1\.2\.0\s*First release\s*$/,
      ]);
      await expect(earlier.locator("[data-icon=sparkles]")).toHaveCount(2);
    });

    test("opens an earlier version's notes and goes back to What’s new", async ({
      page,
    }) => {
      await page.goto(WHATS_NEW_PAGE);

      await page
        .getByRole("region", { name: "Earlier versions" })
        .getByRole("link", { name: /^1\.2\.2/ })
        .click();

      await expect(page).toHaveURL(`${WHATS_NEW_PAGE}/1.2.2`);
      await expect(
        page.getByRole("heading", { level: 1, name: "What’s new in 1.2.2" }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Fixed in 1.2.2" })
          .getByRole("listitem"),
      ).toHaveText(["Covers no longer flicker"]);
      await page.getByRole("link", { name: "Back to What’s new" }).click();
      await expect(page).toHaveURL(WHATS_NEW_PAGE);
    });

    test("says a version this build has no notes for isn't there", async ({
      page,
    }) => {
      await page.goto(`${WHATS_NEW_PAGE}/0.9.0`);

      await expect(
        page.getByRole("heading", { name: "This page doesn't exist" }),
      ).toBeVisible();
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations on an earlier version in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(`${WHATS_NEW_PAGE}/1.2.2`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }

    test("names this version's notes and the earlier ones", async ({
      page,
    }) => {
      await page.goto(ABOUT_PAGE);

      await expect(
        whatsNewRow(page).getByText(
          `Notes for ${FAKE_APP_VERSION} and earlier versions`,
          { exact: true },
        ),
      ).toBeVisible();
    });
  });

  test.describe("without notes for this version", () => {
    test.use(backendWith({ installed: null, earlier: [EARLIER] }));

    test("leaves What’s new out of About", async ({ page }) => {
      await page.goto(ABOUT_PAGE);
      await expect(
        page.getByRole("main").getByRole("link", { name: /^Report a problem/ }),
      ).toBeVisible();

      await expect(whatsNewRow(page)).toHaveCount(0);
    });
  });
});

test.describe("What’s new on a computer", () => {
  test.use({
    backend: {
      ...onPlatform("linux").backend,
      whatsNew: () => ({ installed: INSTALLED, earlier: [] }),
    },
  });

  test("leaves What’s new out of About for now", async ({ page }) => {
    await page.goto(ABOUT_PAGE);
    await expect(
      page.getByRole("main").getByRole("link", { name: /^Report a problem/ }),
    ).toBeVisible();

    await expect(whatsNewRow(page)).toHaveCount(0);
  });
});
