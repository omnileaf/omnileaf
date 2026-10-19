import type { Page } from "@playwright/test";

import { CommandFailure } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  FAKE_APP_VERSION,
  FAKE_REPORT_CODE,
  FAKE_SYSTEM,
  IPAD_USER_AGENT,
  IPHONE_USER_AGENT,
  onPlatform,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";

const REPORT_PAGE = "/settings/about/report";
const GROUP_GAP = 24;
const NOTE_GAP = 20;
const OTHER_WAYS_GAP = 28;
const HEADING_GAP = 26;
const REPLY_ADDRESS = "reader@example.org";
const LOGGED = [
  "INFO omnileaf_app: open the library",
  "WARN omnileaf_engine::scan: skip a book path=<path>",
];

function included(page: Page) {
  return page.getByRole("region", { name: "What's included" });
}

function waysOut(page: Page) {
  return page.getByRole("region", { name: "Other ways to send it" });
}

function replyField(page: Page) {
  return page.getByRole("textbox", { name: "Email for a reply (optional)" });
}

function sendButton(page: Page) {
  return page.getByRole("button", { name: "Send to Omnileaf" });
}

function shownAlert(page: Page) {
  return page.getByRole("main").getByRole("alert").filter({ hasText: /\S/ });
}

function sendNote(page: Page) {
  return page.getByText("No account needed; the maintainers see it first.");
}

async function keptCodes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const kept: unknown = JSON.parse(
      window.localStorage.getItem("omnileaf.yourReports") ?? "[]",
    );
    return Array.isArray(kept)
      ? kept.map((report: { code: string }) => report.code)
      : [];
  });
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
        code: FAKE_REPORT_CODE,
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

test.describe("sending it to Omnileaf", () => {
  const sentTo: (string | null)[] = [];
  const copiedCodes: string[] = [];

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      sendProblemReport: (replyTo) => {
        sentTo.push(replyTo);
        return null;
      },
      copyProblemReportCode: (code) => {
        copiedCodes.push(code);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    sentTo.length = 0;
    copiedCodes.length = 0;
  });

  test("asks for an email only for a reply and needs no account", async ({
    page,
  }) => {
    await openReport(page);

    await expect(replyField(page)).toHaveAttribute(
      "placeholder",
      "you@example.com",
    );
    await expect(replyField(page)).toHaveAccessibleDescription(
      "Used only to answer you; never shown in an issue.",
    );
    await expect(sendNote(page)).toBeVisible();
  });

  test("edges the email field in the accent colour while it has focus", async ({
    page,
  }) => {
    await openReport(page);

    await replyField(page).focus();

    await expect(replyField(page)).toHaveCSS(
      "border-top-color",
      await tokenColour(page, "--color-accent"),
    );
  });

  test("sends it with the email for a reply, says it was sent and keeps its code", async ({
    page,
  }) => {
    await openReport(page);
    await replyField(page).fill(REPLY_ADDRESS);

    await sendButton(page).click();

    await expect(
      page.getByRole("listitem").filter({ hasText: "Report sent" }),
    ).toContainText(`Code ${FAKE_REPORT_CODE} · kept in Your reports`);
    expect(sentTo).toEqual([REPLY_ADDRESS]);
    expect(await keptCodes(page)).toEqual([FAKE_REPORT_CODE]);
  });

  test("copies the sent report's code from its notice", async ({ page }) => {
    await openReport(page);
    await sendButton(page).click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "Report sent" })
      .getByRole("button", { name: "Copy code" })
      .click();

    await expect.poll(() => copiedCodes).toEqual([FAKE_REPORT_CODE]);
  });

  test("sends it with no email when none is given", async ({ page }) => {
    await openReport(page);

    await sendButton(page).click();

    await expect(
      page.getByRole("listitem").filter({ hasText: "Report sent" }),
    ).toBeVisible();
    expect(sentTo).toEqual([null]);
  });

  test("sets the email a group below what's included, Send to Omnileaf a group below it and its note 20px under", async ({
    page,
  }) => {
    await openReport(page);
    const includedBox = await boxOf(included(page));
    const fieldBox = await boxOf(replyField(page).locator(".."));
    const sendBox = await boxOf(sendButton(page));
    const noteBox = await boxOf(sendNote(page));

    expect(fieldBox.y - (includedBox.y + includedBox.height)).toBeCloseTo(
      GROUP_GAP,
      0,
    );
    expect(sendBox.y - (fieldBox.y + fieldBox.height)).toBeCloseTo(
      GROUP_GAP,
      0,
    );
    expect(noteBox.y - (sendBox.y + sendBox.height)).toBeCloseTo(NOTE_GAP, 0);
  });

  test("stretches Send to Omnileaf across a phone or tablet", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width >= EXPANDED_MIN_WIDTH, "under 840px only");
    await openReport(page);

    const fieldBox = await boxOf(replyField(page).locator(".."));
    const sendBox = await boxOf(sendButton(page));

    expect(sendBox.width).toBeCloseTo(fieldBox.width, 0);
  });

  test("leaves Send to Omnileaf its own width beside Settings", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "840px and up");
    await openReport(page);

    const fieldBox = await boxOf(replyField(page).locator(".."));
    const sendBox = await boxOf(sendButton(page));

    expect(sendBox.x).toBeCloseTo(fieldBox.x, 0);
    expect(sendBox.width).toBeLessThan(fieldBox.width / 2);
  });
});

test.describe("when there's nowhere to send it", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      sendProblemReport: () => {
        throw new CommandFailure({
          code: "reportsNotSent",
          message: "problem reports have nowhere to be sent yet",
        });
      },
    },
  });

  test("says Send to Omnileaf is coming soon and keeps no code", async ({
    page,
  }) => {
    await openReport(page);

    await sendButton(page).click();

    await expect(shownAlert(page)).toHaveText("Send to Omnileaf · coming soon");
    expect(await keptCodes(page)).toEqual([]);
  });
});

test.describe("when the code can't be copied", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      copyProblemReportCode: () => {
        throw new CommandFailure({
          code: "clipboardUnavailable",
          message: "the clipboard could not be written",
        });
      },
    },
  });

  test("says the code couldn't be copied", async ({ page }) => {
    await openReport(page);
    await sendButton(page).click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "Report sent" })
      .getByRole("button", { name: "Copy code" })
      .click();

    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Couldn't copy the code. Try again." }),
    ).toBeVisible();
  });
});

test.describe("sending it another way", () => {
  const shared: string[] = [];

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      copyProblemReport: () => {
        shared.push("copied");
        return null;
      },
      openProblemReportIssue: () => {
        shared.push("opened");
        return null;
      },
    },
  });

  test.beforeEach(() => {
    shared.length = 0;
  });

  test("copies the report and keeps its code in Your reports", async ({
    page,
  }) => {
    await openReport(page);

    await waysOut(page).getByRole("button", { name: "Copy report" }).click();

    await expect(
      page.getByRole("listitem").filter({ hasText: "Report copied" }),
    ).toContainText(`Code ${FAKE_REPORT_CODE} · kept in Your reports`);
    expect(shared).toEqual(["copied"]);
    expect(await keptCodes(page)).toEqual([FAKE_REPORT_CODE]);
  });

  test("opens the report as a new issue on GitHub", async ({ page }) => {
    await openReport(page);

    await waysOut(page)
      .getByRole("button", { name: /^Open on GitHub/ })
      .click();

    await expect.poll(() => shared).toEqual(["opened"]);
    expect(await keptCodes(page)).toEqual([FAKE_REPORT_CODE]);
  });

  test("sets the other ways 28px below Send to Omnileaf's note, 26px under their heading", async ({
    page,
  }) => {
    await openReport(page);
    const noteBox = await boxOf(sendNote(page));
    const headingBox = await boxOf(
      waysOut(page).getByRole("heading", { name: "Other ways to send it" }),
    );
    const listBox = await boxOf(waysOut(page).getByRole("list"));

    expect(headingBox.y - (noteBox.y + noteBox.height)).toBeCloseTo(
      OTHER_WAYS_GAP,
      0,
    );
    expect(listBox.y - (headingBox.y + headingBox.height)).toBeCloseTo(
      HEADING_GAP,
      0,
    );
  });

  test("keeps one code however many ways it goes", async ({ page }) => {
    await openReport(page);

    await waysOut(page).getByRole("button", { name: "Copy report" }).click();
    await waysOut(page)
      .getByRole("button", { name: /^Open on GitHub/ })
      .click();

    await expect.poll(() => shared).toEqual(["copied", "opened"]);
    expect(await keptCodes(page)).toEqual([FAKE_REPORT_CODE]);
  });
});

test.describe("saving it as a file", () => {
  const saved: number[] = [];
  const shown: string[] = [];

  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      saveProblemReport: (today) => {
        saved.push(today);
        return {
          place: { kind: "folder", folder: "~/Downloads" },
          file: "omnileaf-report-2026-10-16.txt",
        };
      },
      showSavedProblemReport: () => {
        shown.push("shown");
        return null;
      },
    },
  });

  test.beforeEach(() => {
    saved.length = 0;
    shown.length = 0;
  });

  test("saves it for today, says where and shows it in its folder", async ({
    page,
  }) => {
    await openReport(page);
    const today = await page.evaluate(() => {
      const now = new Date();
      return (
        Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000
      );
    });

    await waysOut(page).getByRole("button", { name: "Save as a file" }).click();

    const notice = page
      .getByRole("listitem")
      .filter({ hasText: "Report saved" });
    await expect(notice).toContainText(
      "In ~/Downloads: omnileaf-report-2026-10-16.txt",
    );
    expect(saved).toEqual([today]);
    expect(await keptCodes(page)).toEqual([FAKE_REPORT_CODE]);
    await notice.getByRole("button", { name: "Show in folder" }).click();
    await expect.poll(() => shown).toEqual(["shown"]);
  });
});

for (const [device, userAgent, place] of [
  ["an iPhone", IPHONE_USER_AGENT, "On My iPhone"],
  ["an iPad", IPAD_USER_AGENT, "On My iPad"],
] as const) {
  test.describe(`saving on ${device}`, () => {
    test.use({
      userAgent,
      backend: {
        ...onPlatform("ios").backend,
        saveProblemReport: () => ({
          place: { kind: "appFiles" },
          file: "omnileaf-report-2026-10-16.txt",
        }),
      },
    });

    test("says the report is in Files, inside Omnileaf, on the device at any window width", async ({
      page,
    }) => {
      await openReport(page);

      await waysOut(page)
        .getByRole("button", { name: "Save as a file" })
        .click();

      const notice = page
        .getByRole("listitem")
        .filter({ hasText: "Report saved" });
      await expect(notice).toContainText(
        `In Files › ${place} › Omnileaf › Reports`,
      );
      await expect(notice.getByRole("button", { name: /^Show/ })).toHaveCount(
        0,
      );
    });
  });
}

test.describe("on Android", () => {
  testOnlyInItsWebview("android");
  test.use(onPlatform("android"));

  test("offers no Save as a file", async ({ page }) => {
    await openReport(page);

    await expect(
      waysOut(page).getByRole("button", { name: "Copy report" }),
    ).toBeVisible();
    await expect(
      waysOut(page).getByRole("button", { name: "Save as a file" }),
    ).toHaveCount(0);
  });
});

test.describe("when the device turns the report down", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      copyProblemReport: () => {
        throw new CommandFailure({
          code: "clipboardUnavailable",
          message: "the clipboard could not be written",
        });
      },
      openProblemReportIssue: () => {
        throw new CommandFailure({
          code: "browserUnavailable",
          message: "the browser could not be opened",
        });
      },
      saveProblemReport: () => {
        throw new CommandFailure({
          code: "reportNotSaved",
          message: "the problem report could not be saved",
        });
      },
      sendProblemReport: () => {
        throw new CommandFailure({
          code: "internal",
          message: "the report could not be sent",
        });
      },
    },
  });

  test("says the report couldn't be sent", async ({ page }) => {
    await openReport(page);

    await sendButton(page).click();

    await expect(shownAlert(page)).toHaveText(
      "Couldn't send the report. Try again.",
    );
  });

  test("says the report couldn't be saved", async ({ page }) => {
    await openReport(page);

    await waysOut(page).getByRole("button", { name: "Save as a file" }).click();

    await expect(shownAlert(page)).toHaveText(
      "Couldn't save the report. Try again.",
    );
  });

  test("says the report couldn't be copied and keeps no code", async ({
    page,
  }) => {
    await openReport(page);

    await waysOut(page).getByRole("button", { name: "Copy report" }).click();

    await expect(shownAlert(page)).toHaveText(
      "Couldn't copy the report. Try again.",
    );
    expect(await keptCodes(page)).toEqual([]);
  });

  test("says the browser couldn't be opened", async ({ page }) => {
    await openReport(page);

    await waysOut(page)
      .getByRole("button", { name: /^Open on GitHub/ })
      .click();

    await expect(shownAlert(page)).toHaveText(
      "Couldn't open your browser. Try again.",
    );
  });
});

test.describe("with nothing logged", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      problemReport: () => ({
        code: FAKE_REPORT_CODE,
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
            code: FAKE_REPORT_CODE,
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
