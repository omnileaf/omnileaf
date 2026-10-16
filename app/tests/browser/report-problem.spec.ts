import type { Page } from "@playwright/test";

import { CommandFailure } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  FAKE_APP_VERSION,
  FAKE_SYSTEM,
  onPlatform,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

const REPORT_PAGE = "/settings/about/report";
const LOGGED = [
  "INFO omnileaf_app: open the library",
  "WARN omnileaf_engine::scan: skip a book path=<path>",
];

function included(page: Page) {
  return page.getByRole("region", { name: "What's included" });
}

async function openReport(page: Page): Promise<void> {
  await page.goto(REPORT_PAGE);
  await expect(
    page.getByRole("heading", { level: 1, name: "Report a problem" }),
  ).toBeVisible();
}

test.describe("with a few lines logged", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      problemReport: () => ({
        version: FAKE_APP_VERSION,
        system: FAKE_SYSTEM,
        log: LOGGED,
      }),
    },
  });

  test("opens from About's Report a problem", async ({ page }) => {
    await page.goto("/settings/about");

    await page.getByRole("link", { name: /^Report a problem/ }).click();

    await expect(page).toHaveURL(REPORT_PAGE);
    await expect(
      page.getByRole("heading", { level: 1, name: "Report a problem" }),
    ).toBeFocused();
  });

  test("says what's included before anything leaves", async ({ page }) => {
    await openReport(page);

    await expect(
      page.getByText(
        "Nothing is sent until you choose. Names become stand-ins and anything 18+ is left out.",
      ),
    ).toBeVisible();
    await expect(included(page)).toContainText(
      `Version and device ${FAKE_APP_VERSION} · ${FAKE_SYSTEM}`,
    );
    await expect(included(page)).toContainText(
      "Log The last 2 lines, names replaced",
    );
  });

  test("shows the log lines behind Show and folds them away again", async ({
    page,
  }) => {
    await openReport(page);
    const show = included(page).getByRole("button", { name: "Show" });

    await show.click();

    const lines = included(page).getByRole("region", { name: "Log" });
    await expect(lines).toHaveText(LOGGED.join("\n"));
    await included(page).getByRole("button", { name: "Hide" }).click();
    await expect(lines).toBeHidden();
    await expect(show).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("with nothing logged", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      problemReport: () => ({
        version: FAKE_APP_VERSION,
        system: null,
        log: [],
      }),
    },
  });

  test("names only the version and says nothing was logged", async ({
    page,
  }) => {
    await openReport(page);

    await expect(included(page)).toContainText(
      `Version and device ${FAKE_APP_VERSION} Log`,
    );
    await expect(included(page)).toContainText("Log Nothing logged yet");
    await expect(
      included(page).getByRole("button", { name: "Show" }),
    ).toHaveCount(0);
  });
});

test.describe("when the report can't be put together", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      problemReport: () => {
        throw new CommandFailure({
          code: "internal",
          message: "the library could not be read",
        });
      },
    },
  });

  test("says so and offers to try again", async ({ page }) => {
    await openReport(page);

    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Couldn't put the report together.",
    );
    await expect(
      page.getByRole("main").getByRole("button", { name: "Try again" }),
    ).toBeVisible();
  });
});

for (const platform of ["android", "ios", "linux"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`on ${platform}`, () => {
      testOnlyInItsWebview(platform);
      test.use({
        backend: {
          ...onPlatform(platform).backend,
          problemReport: () => ({
            version: FAKE_APP_VERSION,
            system: FAKE_SYSTEM,
            log: LOGGED,
          }),
        },
      });

      test(`Report a problem has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openReport(page);
        await included(page).getByRole("button", { name: "Show" }).click();

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    });
  }
}
