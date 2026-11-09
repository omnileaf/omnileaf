import type { Page } from "@playwright/test";

import { expectHeadingFocused, heading } from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import {
  CODES,
  ISSUE_TEXT_START,
  RECEIVED_TEXT,
  UNKNOWN_CODE,
} from "./samples.ts";
import { openSignedIn } from "./sign-in.ts";
import { failOnce, ISSUE_API } from "./stubs.ts";

function title(code: string): string {
  return `Copy ${code} as a public issue`;
}

async function openIssue(page: Page, code: string): Promise<void> {
  await openSignedIn(page, `/admin/reports/${code}/issue`);
}

test("the old address of the issue page opens the issue", async ({ page }) => {
  await openIssue(page, CODES.received);

  await expect(heading(page)).toHaveText(title(CODES.received));
  const text = page.getByLabel("Public issue text");
  const body = await text.inputValue();
  expect(body.startsWith(ISSUE_TEXT_START)).toBe(true);
  expect(body).toContain(RECEIVED_TEXT);
  await expect(text).toHaveAttribute("readonly", "");
});

test("copy as public issue on the report opens the issue and focuses its heading", async ({
  page,
}) => {
  await openSignedIn(page, `/admin/reports/${CODES.received}`);

  await page.getByRole("link", { name: "Copy as public issue" }).click();

  await expect(heading(page)).toHaveText(title(CODES.received));
  await expectHeadingFocused(page);
  await page.getByRole("link", { name: "Back to the report" }).click();
  await expect(heading(page)).toHaveText(CODES.received);
});

test.describe("with the clipboard allowed", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copy text puts the issue text on the clipboard and says so", async ({
    page,
  }) => {
    await openIssue(page, CODES.received);

    await page.getByRole("button", { name: "Copy text" }).click();

    await expect(page.getByRole("status")).toHaveText("Copied");
    const shown = await page.getByLabel("Public issue text").inputValue();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      shown,
    );
  });
});

test("when the clipboard refuses the text is selected for the keyboard @webkit", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException("refused", "NotAllowedError"));
  });
  await openIssue(page, CODES.received);

  await page.getByRole("button", { name: "Copy text" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "The text is selected. Copy it with the keyboard.",
  );
  const text = page.getByLabel("Public issue text");
  await expect(text).toBeFocused();
  const selection = await text.evaluate((area: HTMLTextAreaElement) => ({
    start: area.selectionStart,
    end: area.selectionEnd,
    length: area.value.length,
  }));
  expect(selection.start).toBe(0);
  expect(selection.end).toBe(selection.length);
  expect(selection.length).toBeGreaterThan(0);
});

test.describe("with the clipboard allowed again", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copied is announced again on a second click", async ({ page }) => {
    await openIssue(page, CODES.received);
    await page.evaluate(() => {
      const status = document.querySelector("[role=status]");
      const seen: string[] = [];
      Reflect.set(globalThis, "announced", seen);
      new MutationObserver(() => {
        seen.push(status?.textContent ?? "");
      }).observe(status ?? document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
    const announced = (): Promise<string[]> =>
      page.evaluate(() => {
        const seen: unknown = Reflect.get(globalThis, "announced");
        return Array.isArray(seen) ? seen.map(String) : [];
      });

    await page.getByRole("button", { name: "Copy text" }).click();
    await expect(page.getByRole("status")).toHaveText("Copied");
    await page.getByRole("button", { name: "Copy text" }).click();

    await expect.poll(announced).toEqual(["Copied", "", "Copied"]);
  });
});

test("a purged report has nothing to copy", async ({ page }) => {
  await openIssue(page, CODES.closed);

  await expect(page.getByText("Nothing to copy")).toBeVisible();
  await expect(page.getByLabel("Public issue text")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to the report" }),
  ).toHaveAttribute("href", `/admin/reports/${CODES.closed}`);
});

test("an odd code in the address does not crash the page", async ({ page }) => {
  await openIssue(page, "%2Fx");

  await expect(page.getByText("This report does not exist")).toBeVisible();
  await expect(page.locator('main a[href="/admin/reports/%2Fx"]')).toHaveCount(
    1,
  );
});

test("a report nobody sent is not found", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);

  await openIssue(page, UNKNOWN_CODE);

  await expect(page.getByText("This report does not exist")).toBeVisible();
});

test("a failed load can be tried again", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await openSignedIn(page, "/admin");
  await failOnce(page, ISSUE_API, 502, { error: "relayUnavailable" });
  await page.goto(`/admin/reports/${CODES.received}/issue`);

  await expect(page.getByText("Could not load the issue text")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();

  expect(await page.getByLabel("Public issue text").inputValue()).toContain(
    RECEIVED_TEXT,
  );
  await expectHeadingFocused(page);
});
