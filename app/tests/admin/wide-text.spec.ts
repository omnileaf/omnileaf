import type { Locator, Page } from "@playwright/test";

import {
  expectNoSidewaysOverflow,
  expectTextWidened,
  heading,
} from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import { CODES, PROBLEM } from "./samples.ts";
import { openSignedIn } from "./sign-in.ts";
import { failOnce, SESSION_API, widenText } from "./stubs.ts";

interface Screen {
  readonly name: string;
  readonly path: string;
  readonly heading: string;
  readonly content: (page: Page) => Locator;
}

const SCREENS: readonly Screen[] = [
  {
    name: "dashboard",
    path: "/admin",
    heading: "Dashboard",
    content: (page) => page.getByRole("link", { name: /^Received\s/ }),
  },
  {
    name: "reports list",
    path: "/admin/reports",
    heading: "Reports",
    content: (page) => page.getByRole("link", { name: CODES.received }),
  },
  {
    name: "report that can be moved anywhere",
    path: `/admin/reports/${CODES.received}`,
    heading: CODES.received,
    content: (page) => page.locator("pre"),
  },
  {
    name: "closed report",
    path: `/admin/reports/${CODES.closed}`,
    heading: CODES.closed,
    content: (page) =>
      page.getByText("The text of this report has been purged."),
  },
  {
    name: "final report",
    path: `/admin/reports/${CODES.published}`,
    heading: CODES.published,
    content: (page) => page.getByText("This report is final"),
  },
  {
    name: "public issue page",
    path: `/admin/reports/${CODES.received}/issue`,
    heading: `Copy ${CODES.received} as a public issue`,
    content: (page) => page.getByLabel("Public issue text"),
  },
  {
    name: "page that does not exist",
    path: "/admin/nothing-here",
    heading: "Page not found",
    content: (page) =>
      page.getByRole("link", { name: "Back to the dashboard" }),
  },
];

test.beforeEach(async ({ page }) => {
  await widenText(page);
});

async function expectFitsWithWiderText(
  page: Page,
  content: Locator,
): Promise<void> {
  await expect(content).toBeVisible();
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  await expectTextWidened(page);
  await expectNoSidewaysOverflow(page);
}

for (const screen of SCREENS) {
  test(`the ${screen.name} fits with wider text`, async ({ page }) => {
    await openSignedIn(page, screen.path);

    await expect(heading(page)).toHaveText(screen.heading);
    await expectFitsWithWiderText(page, screen.content(page));
  });
}

test("the confirm step fits with wider text", async ({ page }) => {
  await openSignedIn(page, `/admin/reports/${CODES.received}`);
  await page.getByLabel("Issue number").fill("77");

  await page.getByRole("button", { name: "Published", exact: true }).click();

  await expectFitsWithWiderText(
    page,
    page.getByText("This cannot be changed afterwards."),
  );
});

test("the refusal note fits with wider text", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await openSignedIn(page, `/admin/reports/${CODES.received}`);

  await page.getByRole("button", { name: "Reviewing", exact: true }).click();

  await expectFitsWithWiderText(page, page.locator(PROBLEM));
});

test("the session problem page fits with wider text", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await openSignedIn(page, "/admin");
  await failOnce(page, SESSION_API, 502, { error: "relayUnavailable" });

  await page.goto("/admin");

  await expect(heading(page)).toHaveText("Could not open your session");
  await expectFitsWithWiderText(
    page,
    page.getByRole("button", { name: "Try again" }),
  );
});
