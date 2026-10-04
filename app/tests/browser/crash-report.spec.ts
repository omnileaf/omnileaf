import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import type { CrashReportOffer } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const SAVED_PANIC: CrashReportOffer = {
  details:
    "Omnileaf 1.2.3 on Android\nPanic: index out of bounds\nAt: omnileaf-formats/src/zip_book.rs:42:5\n",
  origin: "panic",
};
const CHOICE_KEY = "omnileaf.crash-reports";

interface Calls {
  offered: CrashReportOffer | null;
  sent: number;
  declined: number;
}

function fakeCrashReports(calls: Calls) {
  return {
    offerSavedCrashReport: () => calls.offered,
    sendCrashReport: () => {
      calls.sent += 1;
      calls.offered = null;
      return null;
    },
    declineCrashReport: () => {
      calls.declined += 1;
      calls.offered = null;
      return null;
    },
  };
}

function freshCalls(saved: CrashReportOffer | null = SAVED_PANIC): Calls {
  return {
    offered: saved,
    sent: 0,
    declined: 0,
  };
}

function prompt(page: Page) {
  return page.getByRole("alertdialog");
}

function sendButton(page: Page) {
  return prompt(page).getByRole("button", { name: "Send report" });
}

async function chooseBeforeOpening(
  page: Page,
  choice: "always" | "never",
): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [CHOICE_KEY, choice] as const,
  );
}

for (const platform of ["android", "linux"] as const) {
  test.describe(`on ${platform}, after a crash`, () => {
    const calls = freshCalls();

    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        appInfo: () => ({
          version: "1.2.3",
          platform,
          sourceCode: "repo.example.org/omnileaf",
        }),
        ...fakeCrashReports(calls),
      },
    });

    test.beforeEach(() => {
      Object.assign(calls, freshCalls());
    });

    test("shows the report before anything is sent", async ({ page }) => {
      await page.goto("/");

      await expect(prompt(page)).toBeVisible();
      await expect(prompt(page)).toContainText("Panic: index out of bounds");
      await expect(prompt(page)).toHaveAccessibleName(
        "Omnileaf closed unexpectedly last time",
      );
      expect(calls.sent).toBe(0);
    });

    test("moves focus into the report when it opens", async ({ page }) => {
      await page.goto("/");

      await expect(
        prompt(page).getByRole("heading", { name: /unexpectedly|wrong/ }),
      ).toBeFocused();
    });

    test("declining sends nothing and closes the report", async ({ page }) => {
      await page.goto("/");

      await prompt(page).getByRole("button", { name: "Don't send" }).click();

      await expect(prompt(page)).toBeHidden();
      expect(calls.declined).toBe(1);
      expect(calls.sent).toBe(0);
    });

    test("Escape declines the report", async ({ page }) => {
      await page.goto("/");
      await expect(prompt(page)).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(prompt(page)).toBeHidden();
      expect(calls.declined).toBe(1);
      expect(calls.sent).toBe(0);
    });

    test("sends the report shown and closes it", async ({ page }) => {
      await page.goto("/");

      await sendButton(page).click();

      await expect(prompt(page)).toBeHidden();
      expect(calls.sent).toBe(1);
    });

    for (const scheme of ["light", "dark"] as const) {
      test(`the report has no accessibility violations in ${scheme}`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto("/");
        await expect(prompt(page)).toBeVisible();

        const results = await new AxeBuilder({ page }).analyze();

        expect(results.violations).toEqual([]);
      });
    }
  });
}

test.describe("set to Always", () => {
  const calls = freshCalls();

  test.use({
    backend: { ...DEFAULT_BACKEND, ...fakeCrashReports(calls) },
  });

  test.beforeEach(() => {
    Object.assign(calls, freshCalls());
  });

  test("sends the report without asking", async ({ page }) => {
    await chooseBeforeOpening(page, "always");

    await page.goto("/");

    await expect.poll(() => calls.sent).toBe(1);
    await expect(prompt(page)).toBeHidden();
  });
});

test.describe("set to Never", () => {
  const calls = freshCalls();

  test.use({
    backend: { ...DEFAULT_BACKEND, ...fakeCrashReports(calls) },
  });

  test.beforeEach(() => {
    Object.assign(calls, freshCalls());
  });

  test("sends nothing and shows nothing", async ({ page }) => {
    await chooseBeforeOpening(page, "never");

    await page.goto("/");

    await expect.poll(() => calls.declined).toBe(1);
    await expect(prompt(page)).toBeHidden();
    expect(calls.sent).toBe(0);
  });
});

test.describe("with nothing saved", () => {
  const calls = freshCalls(null);

  test.use({
    backend: { ...DEFAULT_BACKEND, ...fakeCrashReports(calls) },
  });

  test.beforeEach(() => {
    Object.assign(calls, freshCalls(null));
  });

  test("opens straight to the app", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
    await expect(prompt(page)).toBeHidden();
  });
});
