import { isRedirect } from "@sveltejs/kit";
import { expect, test } from "vitest";

import { redirectToReport } from "#lib/audit-redirect.ts";

function redirected(code: string): { status: number; location: string } {
  try {
    redirectToReport(code);
  } catch (thrown) {
    if (isRedirect(thrown)) {
      return { status: thrown.status, location: thrown.location };
    }
    throw thrown;
  }
  throw new Error("no redirect was thrown");
}

test("sends the old audit address of a report to the report page", () => {
  expect(redirected("R-2222-2222")).toEqual({
    status: 307,
    location: "/admin/reports/R-2222-2222",
  });
});

test("sends any other code to the report page too, which says it does not exist", () => {
  expect(redirected("nope")).toEqual({
    status: 307,
    location: "/admin/reports/nope",
  });
});

test("keeps the code in one path segment", () => {
  expect(redirected("a/b?c#d").location).toBe("/admin/reports/a%2Fb%3Fc%23d");
});
