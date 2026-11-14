import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

const TABLET = { width: 820, height: 1180 };

test.use({ backend: { ...DEFAULT_BACKEND }, viewport: TABLET });

interface SettingChoice {
  readonly path: string;
  readonly title: string;
  readonly shown: string;
  readonly picked: string;
}

const CHOICES: readonly SettingChoice[] = [
  {
    path: "/settings/reading",
    title: "Reading mode for new series",
    shown: "Automatic",
    picked: "Long strip",
  },
  {
    path: "/settings/library/tabs",
    title: "The library opens on",
    shown: "The tab used last",
    picked: "All",
  },
  {
    path: "/settings/advanced",
    title: "Keep Undo for",
    shown: "10 seconds",
    picked: "30 seconds",
  },
  {
    path: "/settings/privacy/screenshot-mode",
    title: "Turn off after",
    shown: "1 hour",
    picked: "Never",
  },
];

async function openChoiceRow(page: Page, choice: SettingChoice) {
  await page.goto(choice.path);
  const row = page.getByRole("button", {
    name: new RegExp(`^${choice.title}`),
  });
  await expect(row).toBeVisible();
  return row;
}

test.describe(
  "a setting with a few values on an Android tablet",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's choice dialog rows");
    });

    for (const choice of CHOICES) {
      test(`shows ${choice.title} as a row with its value that opens a choice dialog`, async ({
        page,
      }) => {
        const row = await openChoiceRow(page, choice);

        await expect(row).toHaveAttribute("aria-haspopup", "dialog");
        await expect(row).toContainText(choice.shown);
        await expect(page.getByRole("combobox")).toHaveCount(0);
        await row.click();
        await page
          .getByRole("dialog", { name: choice.title })
          .getByRole("radio", { name: choice.picked, exact: true })
          .click();

        await expect(page.getByRole("dialog")).toBeHidden();
        await expect(row).toContainText(choice.picked);
      });
    }

    test("has no accessibility violations with the choice dialog open", async ({
      page,
    }) => {
      const choice = CHOICES[0];
      if (choice === undefined) {
        return;
      }
      await (await openChoiceRow(page, choice)).click();
      await expect(page.getByRole("dialog")).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  },
);
