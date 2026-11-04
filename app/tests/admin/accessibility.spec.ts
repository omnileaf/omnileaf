import { expectAccessible, heading } from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import { CODES, UNKNOWN_CODE } from "./samples.ts";
import { openSignedIn, signInAs } from "./sign-in.ts";

interface InterfacePage {
  readonly name: string;
  readonly path: string;
  readonly heading: string | RegExp;
  readonly failedLoads: number;
}

const ISSUE_HEADING = /^Copy .* as a public issue$/;
const PAGES: readonly InterfacePage[] = [
  { name: "dashboard", path: "/admin", heading: "Dashboard", failedLoads: 0 },
  {
    name: "report list",
    path: "/admin/reports",
    heading: "Reports",
    failedLoads: 0,
  },
  {
    name: "filtered list",
    path: "/admin/reports?status=published&platform=ios",
    heading: "Reports",
    failedLoads: 0,
  },
  {
    name: "list with nothing matching",
    path: "/admin/reports?q=zzzz",
    heading: "Reports",
    failedLoads: 0,
  },
  ...Object.entries(CODES).map(([status, code]) => ({
    name: `${status} report`,
    path: `/admin/reports/${code}`,
    heading: code,
    failedLoads: 0,
  })),
  {
    name: "report that does not exist",
    path: `/admin/reports/${UNKNOWN_CODE}`,
    heading: UNKNOWN_CODE,
    failedLoads: 1,
  },
  {
    name: "issue text",
    path: `/admin/reports/${CODES.received}/issue`,
    heading: ISSUE_HEADING,
    failedLoads: 0,
  },
  {
    name: "issue text of a purged report",
    path: `/admin/reports/${CODES.closed}/issue`,
    heading: ISSUE_HEADING,
    failedLoads: 0,
  },
];

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test("the sign-in refusal page is accessible and shows no report", async ({
      page,
      expectFailedLoads,
    }) => {
      expectFailedLoads(1);

      const response = await signInAs(page, "stranger");

      expect(response?.status()).toBe(403);
      await expect(heading(page)).toHaveText("Not allowed");
      await expectAccessible(page);
      expect(await page.content()).not.toContain("R-");
    });

    for (const interfacePage of PAGES) {
      test(`the ${interfacePage.name} is accessible`, async ({
        page,
        expectFailedLoads,
      }) => {
        expectFailedLoads(interfacePage.failedLoads);

        await openSignedIn(page, interfacePage.path);

        await expect(heading(page)).toContainText(interfacePage.heading);
        await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
        await expectAccessible(page);
      });
    }
  });
}
