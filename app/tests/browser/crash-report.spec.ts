import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import type {
  CrashReportOffer,
  InterfaceError,
} from "../../src/lib/ipc/bindings.ts";
import { CommandFailure } from "./fake-backend.ts";
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
  copied: number;
  interfaceErrors: InterfaceError[];
}

function fakeCrashReports(calls: Calls) {
  return {
    offerSavedCrashReport: () => calls.offered,
    offerInterfaceErrorReport: (error: InterfaceError) => {
      calls.interfaceErrors.push(error);
      calls.offered ??= {
        details: `Omnileaf 1.2.3 on Android\nInterface error: ${error.message}\n`,
        origin: "interface",
      };
      return calls.offered;
    },
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
    copyCrashReport: () => {
      calls.copied += 1;
      return null;
    },
  };
}

function freshCalls(saved: CrashReportOffer | null = SAVED_PANIC): Calls {
  return {
    offered: saved,
    sent: 0,
    declined: 0,
    copied: 0,
    interfaceErrors: [],
  };
}

function prompt(page: Page) {
  return page.getByRole("alertdialog");
}

function alwaysSendBox(page: Page) {
  return prompt(page).getByRole("checkbox", {
    name: "Always send reports like this, without asking",
  });
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

/** Throws errors nothing handles, resolving once the page has heard them all. */
async function throwUnhandled(page: Page, times: number): Promise<void> {
  await page.evaluate(async (count) => {
    for (let n = 0; n < count; n += 1) {
      setTimeout(() => {
        throw new TypeError("page is undefined");
      });
    }
    await new Promise((resolve) => setTimeout(resolve));
  }, times);
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

    test("copies the details and says so", async ({ page }) => {
      await page.goto("/");

      await prompt(page).getByRole("button", { name: "Copy details" }).click();

      await expect(prompt(page).getByRole("status")).toHaveText(
        "Report details copied.",
      );
      expect(calls.copied).toBe(1);
    });

    test("sending with Always ticked keeps that choice in Privacy", async ({
      page,
    }) => {
      await page.goto("/");

      await alwaysSendBox(page).check();
      await sendButton(page).click();
      await page.goto("/settings/privacy");

      await expect(
        page.getByRole("radio", { name: "Always send" }),
      ).toBeChecked();
    });

    test("a later report opens with Always unticked", async ({ page }) => {
      await page.goto("/");
      await alwaysSendBox(page).check();
      await prompt(page).getByRole("button", { name: "Don't send" }).click();
      await expect(prompt(page)).toBeHidden();

      await throwUnhandled(page, 1);

      await expect(prompt(page)).toContainText("Interface error");
      await expect(alwaysSendBox(page)).not.toBeChecked();
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

  test("offers an error the interface didn't handle at once", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();

    await page.evaluate(() => {
      setTimeout(() => {
        throw new TypeError("page is undefined");
      });
    });

    await expect(prompt(page)).toHaveAccessibleName("Something went wrong");
    await expect(prompt(page)).toContainText(
      "Interface error: TypeError: page is undefined",
    );
    expect(calls.interfaceErrors.map((error) => error.message)).toEqual([
      "TypeError: page is undefined",
    ]);
    expect(calls.sent).toBe(0);
  });
  test("doesn't ask again once an interface error was declined", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
    await throwUnhandled(page, 1);
    await prompt(page).getByRole("button", { name: "Don't send" }).click();
    await expect(prompt(page)).toBeHidden();

    await throwUnhandled(page, 1);

    await expect(prompt(page)).toBeHidden();
    expect(calls.interfaceErrors).toHaveLength(1);
  });
});

test.describe("set to Always, with nothing saved", () => {
  const calls = freshCalls(null);

  test.use({
    backend: { ...DEFAULT_BACKEND, ...fakeCrashReports(calls) },
  });

  test.beforeEach(() => {
    Object.assign(calls, freshCalls(null));
  });

  test("sends an error that keeps happening only once", async ({ page }) => {
    await chooseBeforeOpening(page, "always");
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();

    await throwUnhandled(page, 3);

    await expect.poll(() => calls.sent).toBe(1);
    await expect(prompt(page)).toBeHidden();
    expect(calls.interfaceErrors).toHaveLength(1);
  });
});

test.describe("when the browser can't open", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      ...fakeCrashReports(freshCalls()),
      sendCrashReport: () => {
        throw new CommandFailure({
          code: "browserUnavailable",
          message: "the browser could not be opened",
        });
      },
    },
  });

  test("keeps the report open and says why", async ({ page }) => {
    await page.goto("/");

    await sendButton(page).click();

    await expect(prompt(page).getByRole("alert")).toHaveText(
      "Couldn't open your browser. Try again.",
    );
    await expect(prompt(page)).toBeVisible();
  });
});
