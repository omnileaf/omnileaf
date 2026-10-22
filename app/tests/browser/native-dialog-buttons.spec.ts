import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

interface NativeButton {
  readonly height: number;
  readonly target: string;
}

const NATIVE_BUTTONS: Readonly<Partial<Record<Platform, NativeButton>>> = {
  ios: { height: 34, target: "44px" },
  android: { height: 40, target: "48px" },
};

const BACKEND_KEEPING_LABELS: FakeBackend = {
  ...DEFAULT_BACKEND,
  libraryCategories: () => [],
  categorySeriesCount: () => 0,
  libraryTabs: () => [{ id: { kind: "all" }, isHidden: false }],
  seriesLabels: () => ({
    keepsLabels: true,
    categories: [],
    tags: [],
    suggestedTags: [],
  }),
};

async function openNewCategory(page: Page): Promise<Locator> {
  await page.goto("/settings/library/tabs");
  await page.getByRole("button", { name: "New category" }).click();
  const dialog = page.getByRole("dialog", { name: "New category" });
  await expect(dialog).toBeVisible();
  return dialog;
}

function platformOf(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.documentElement.dataset.platform);
}

test.describe("a dialog's buttons", { tag: "@native" }, () => {
  test.use({ backend: BACKEND_KEEPING_LABELS });

  test("draws Add and Cancel as the platform's own buttons, or today's where it has none", async ({
    page,
    platform,
  }) => {
    const dialog = await openNewCategory(page);
    const shown = await platformOf(page);
    const native =
      platform === undefined ? undefined : NATIVE_BUTTONS[platform];

    expect(shown).toBe(platform ?? "linux");

    for (const name of ["Add", "Cancel"]) {
      const button = dialog.getByRole("button", { name });
      const target = await button.evaluate(
        (element) => getComputedStyle(element, "::before").height,
      );
      if (native === undefined) {
        expect(target).toBe("auto");
        continue;
      }
      expect((await boxOf(button)).height).toBeCloseTo(native.height, 0);
      expect(target).toBe(native.target);
    }
  });

  test("has no accessibility violations with the dialog open", async ({
    page,
  }) => {
    await openNewCategory(page);

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});
