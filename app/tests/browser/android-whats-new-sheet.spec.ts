import type { Locator, Page } from "@playwright/test";

import type {
  LastSeen,
  VersionNotes,
  WhatsNewNotice,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  FAKE_APP_VERSION,
  framesPassed,
  onPlatform,
  test,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const SEEN_KEY = "omnileaf.whatsNewSeen";

const NOTES: VersionNotes = {
  version: FAKE_APP_VERSION,
  entries: [
    { kind: "feat", summary: "Series pages show their sections as tabs" },
    { kind: "fix", summary: "Back closes an open sheet on Android" },
  ],
};

function noticeAfter(lastSeen: LastSeen): WhatsNewNotice {
  return lastSeen.kind === "version" && lastSeen.version === FAKE_APP_VERSION
    ? { kind: "nothing" }
    : { kind: "show", notes: NOTES };
}

function updatedBackend(base: FakeBackend = DEFAULT_BACKEND): FakeBackend {
  return {
    ...base,
    whatsNew: () => ({ installed: NOTES, earlier: [] }),
    whatsNewNotice: noticeAfter,
  };
}

function whatsNew(page: Page): Locator {
  return page.getByRole("dialog", {
    name: `What’s new in ${FAKE_APP_VERSION}`,
  });
}

async function seenVersion(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), SEEN_KEY);
}

const LIBRARY = sampleSeries(3);

interface HeldNotice {
  answer: PromiseWithResolvers<undefined>;
  asked: number;
}

function heldNotice(): HeldNotice {
  return { answer: Promise.withResolvers<undefined>(), asked: 0 };
}

let notice = heldNotice();

function busyLibraryBackend(): FakeBackend {
  return {
    ...updatedBackend({
      ...DEFAULT_BACKEND,
      librarySeries: pagedSeries(() => LIBRARY),
      librarySeriesCount: () => LIBRARY.length,
    }),
    whatsNewNotice: async (lastSeen) => {
      notice.asked += 1;
      await notice.answer.promise;
      return noticeAfter(lastSeen);
    },
  };
}

async function answerNoticeWhileBusy(page: Page): Promise<void> {
  await expect.poll(() => notice.asked).toBe(1);
  notice.answer.resolve(undefined);
  await framesPassed(page);
}

async function openLibraryWithSeries(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toContainText(
    LIBRARY[0]?.title ?? "",
  );
}

test.describe(
  "What’s new after an update on Android",
  { tag: "@native" },
  () => {
    test.use({ backend: updatedBackend() });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's What’s new sheet");
    });

    test("shows the new version's notes over the library", async ({ page }) => {
      await page.goto("/");

      await expect(whatsNew(page)).toBeVisible();
      await expect(whatsNew(page).getByRole("listitem")).toHaveText([
        "Series pages show their sections as tabs",
        "Back closes an open sheet on Android",
      ]);
    });

    test("keeps the version as seen once Got it is pressed, and shows it no more", async ({
      page,
    }) => {
      await page.goto("/");
      await whatsNew(page).getByRole("button", { name: "Got it" }).click();
      await expect(whatsNew(page)).toHaveCount(0);

      await page.reload();

      await expect(
        page.getByRole("heading", { level: 1, name: "Library" }),
      ).toBeVisible();
      await expect(whatsNew(page)).toHaveCount(0);
      expect(await seenVersion(page)).toBe(FAKE_APP_VERSION);
    });

    test("keeps the version as seen once the sheet is dismissed", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(whatsNew(page)).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(whatsNew(page)).toHaveCount(0);
      expect(await seenVersion(page)).toBe(FAKE_APP_VERSION);
    });

    test("opens every change from See all changes, keeping the version as seen", async ({
      page,
    }) => {
      await page.goto("/");

      await whatsNew(page)
        .getByRole("button", { name: "See all changes" })
        .click();

      await expect(page).toHaveURL("/settings/about/whats-new");
      await expect(
        page.getByRole("heading", { level: 1, name: "What’s new" }),
      ).toBeVisible();
      expect(await seenVersion(page)).toBe(FAKE_APP_VERSION);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto("/");
        await expect(whatsNew(page)).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }

    test.describe("while the library is busy", () => {
      test.use({ backend: busyLibraryBackend() });

      test.beforeEach(() => {
        notice = heldNotice();
      });

      test("waits while another sheet is open over the library", async ({
        page,
      }) => {
        await openLibraryWithSeries(page);
        await page.getByRole("button", { name: /^Sort and filter/ }).click();
        const filter = page.getByRole("dialog", { name: "Sort and filter" });
        await expect(filter).toBeVisible();
        await answerNoticeWhileBusy(page);
        await expect(whatsNew(page)).toHaveCount(0);

        await page.keyboard.press("Escape");

        await expect(filter).toHaveCount(0);
        await expect(whatsNew(page)).toBeVisible();
      });

      test("waits while series are being picked", async ({ page }) => {
        await openLibraryWithSeries(page);
        await page
          .getByRole("list", { name: "Series" })
          .getByRole("link")
          .first()
          .focus();
        await page.keyboard.press("Space");
        await expect(
          page.getByRole("list", { name: "Series" }).getByRole("checkbox"),
        ).not.toHaveCount(0);
        await answerNoticeWhileBusy(page);
        await expect(whatsNew(page)).toHaveCount(0);

        await page.keyboard.press("Escape");

        await expect(whatsNew(page)).toBeVisible();
      });
    });

    test.describe("with a crash report left from last time", () => {
      test.use({
        backend: updatedBackend({
          ...DEFAULT_BACKEND,
          offerSavedCrashReport: () => ({
            details: "Omnileaf 1.2.3 on Android\nPanic: boom\n",
            origin: "panic",
          }),
        }),
      });

      test("waits until the crash report prompt is answered", async ({
        page,
      }) => {
        await page.goto("/");
        const prompt = page.getByRole("alertdialog");
        await expect(prompt).toBeVisible();
        await expect(whatsNew(page)).toHaveCount(0);

        await prompt.getByRole("button", { name: "Don't send" }).click();

        await expect(whatsNew(page)).toBeVisible();
      });
    });

    test.describe("on a new install", () => {
      test.use({
        backend: {
          ...updatedBackend(),
          whatsNewNotice: () => ({ kind: "record" }),
        },
      });

      test("shows nothing and keeps the installed version as seen", async ({
        page,
      }) => {
        await page.goto("/");
        await expect(
          page.getByRole("heading", { level: 1, name: "Library" }),
        ).toBeVisible();

        await expect.poll(() => seenVersion(page)).toBe(FAKE_APP_VERSION);
        await expect(whatsNew(page)).toHaveCount(0);
      });
    });
  },
);

test.describe("What’s new after an update on a computer", () => {
  test.use({ backend: updatedBackend(onPlatform("linux").backend) });

  test("shows no sheet over the library for now", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();

    await expect(whatsNew(page)).toHaveCount(0);
  });
});
