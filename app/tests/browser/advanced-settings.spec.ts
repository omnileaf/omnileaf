import type { Locator, Page } from "@playwright/test";

import type {
  CrashReportOffer,
  InterfaceError,
  Platform,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

type Look = "phone" | "touchPane" | "desktop";

const LOOKS = {
  phone: {
    title: "16px",
    group: "13px",
    noteTitle: "15px",
    rowMin: 64,
    icon: 20,
    play: 18,
    gap: 24,
  },
  touchPane: {
    title: "16px",
    group: "14px",
    noteTitle: "14px",
    rowMin: 64,
    icon: 20,
    play: 18,
    gap: 24,
  },
  desktop: {
    title: "15px",
    group: "13px",
    noteTitle: "14px",
    rowMin: 56,
    icon: 18,
    play: 16,
    gap: 20,
  },
} satisfies Record<Look, unknown>;

const TILE = 36;
const DIALOG_WIDTH = 420;
const DIALOG_BUTTON_HEIGHT = 40;
const SHEET_BUTTON_HEIGHT = 52;
const SHEET_INSET = 20;

const PANIC_REPORT: CrashReportOffer = {
  details: "Omnileaf 1.2.3 on Linux\nPanic: a crash test panicked on purpose\n",
  origin: "panic",
};

const INTERFACE_ERROR =
  "InterfaceErrorTest: a crash test in Settings › Advanced threw on purpose";

interface Calls {
  saved: CrashReportOffer | null;
  panics: number;
  crashes: number;
  interfaceErrors: InterfaceError[];
}

function developmentBuild(platform: Platform, calls: Calls): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    appInfo: () => ({ ...fakeAppInfo(platform), isDevelopmentBuild: true }),
    panicInCore: () => {
      calls.panics += 1;
      calls.saved = PANIC_REPORT;
      return null;
    },
    crashAndQuit: () => {
      calls.crashes += 1;
      return null;
    },
    offerSavedCrashReport: () => calls.saved,
    offerInterfaceErrorReport: (error) => {
      calls.interfaceErrors.push(error);
      return { details: error.message, origin: "interface" };
    },
  };
}

function freshCalls(): Calls {
  return { saved: null, panics: 0, crashes: 0, interfaceErrors: [] };
}

function lookOf(page: Page, platform: Platform): Look {
  if (platform === "linux") {
    return "desktop";
  }
  return viewportOf(page).width < MEDIUM_MIN_WIDTH ? "phone" : "touchPane";
}

function sectionsHoldingAbout(page: Page): Locator {
  return page
    .getByRole("list")
    .filter({ has: page.getByRole("link", { name: /^About/ }) })
    .filter({ visible: true });
}

function crashTests(page: Page): Locator {
  return page.getByRole("region", { name: "Crash reports" });
}

function crashTest(page: Page, name: string): Locator {
  return crashTests(page).getByRole("button", { name });
}

function styleOf(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

async function openCrashQuestion(page: Page): Promise<Locator> {
  await crashTest(page, "Crash and quit").click();
  const dialog = page.getByRole("alertdialog", { name: "Crash Omnileaf now?" });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const platform of ["android", "ios", "linux"] as const) {
  test.describe(`in a development build on ${platform}`, () => {
    const calls = freshCalls();

    test.use({ backend: developmentBuild(platform, calls) });

    test.beforeEach(() => {
      Object.assign(calls, freshCalls());
    });

    test("lists Advanced just above About", async ({ page }) => {
      await page.goto("/settings");

      const group = sectionsHoldingAbout(page);

      await expect(group.getByRole("link").first()).toHaveAccessibleName(
        /^Advanced/,
      );
      await expect(group.getByRole("link")).toHaveCount(2);
    });

    test("summarises Advanced as a development build", async ({ page }) => {
      await page.goto("/settings");
      test.skip(
        viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "phone-width screens show the summaries",
      );

      const advanced = page
        .getByRole("main")
        .getByRole("link", { name: /^Advanced/ });

      await expect(advanced).toContainText("Development build");
    });

    test("heads the page Advanced, under a note that it never ships", async ({
      page,
    }) => {
      await page.goto("/settings/advanced");

      await expect(
        page.getByRole("heading", { level: 1, name: "Advanced" }),
      ).toBeVisible();
      await expect(page.getByRole("note")).toContainText(
        "These tools are only in development builds and never ship.",
      );
    });

    test("sizes the note, the group title and each crash test for the screen", async ({
      page,
    }) => {
      await page.goto("/settings/advanced");
      const look = LOOKS[lookOf(page, platform)];
      const list = await boxOf(crashTests(page).getByRole("list"));

      await expect(crashTests(page).getByRole("button")).toHaveCount(3);
      for (const row of await crashTests(page).getByRole("button").all()) {
        const box = await boxOf(row);
        const tile = await boxOf(row.locator("span[aria-hidden]").first());
        const icons = row.locator("svg");

        expect(box.width).toBeCloseTo(list.width - 2, 0);
        expect(box.height).toBeGreaterThanOrEqual(look.rowMin);
        expect([tile.width, tile.height]).toEqual([TILE, TILE]);
        expect((await boxOf(icons.first())).width).toBe(look.icon);
        expect((await boxOf(icons.last())).width).toBe(look.play);
        expect(
          await styleOf(row.locator("span[id$='-title']"), "font-size"),
        ).toBe(look.title);
      }
      expect(
        await styleOf(crashTests(page).getByRole("heading"), "font-size"),
      ).toBe(look.group);
      expect(
        await styleOf(
          page
            .getByRole("note")
            .getByText("Development build", { exact: true }),
          "font-size",
        ),
      ).toBe(look.noteTitle);
    });

    test("spaces the note and the crash tests apart", async ({ page }) => {
      await page.goto("/settings/advanced");
      const look = LOOKS[lookOf(page, platform)];

      const note = await boxOf(page.getByRole("note"));
      const group = await boxOf(crashTests(page));

      expect(group.y - (note.y + note.height)).toBeCloseTo(look.gap, 0);
    });

    test("marks Crash and quit in the danger colours", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto("/settings/advanced");
      const crash = crashTest(page, "Crash and quit");
      const panic = crashTest(page, "Panic in the core");

      const crashTile = crash.locator("span[aria-hidden]").first();
      const panicTile = panic.locator("span[aria-hidden]").first();

      expect(await styleOf(crashTile, "background-color")).toBe(
        "rgb(246, 227, 227)",
      );
      expect(await styleOf(crash.locator("svg").last(), "color")).toBe(
        "rgb(155, 44, 44)",
      );
      expect(await styleOf(panicTile, "background-color")).toBe(
        "rgb(238, 234, 225)",
      );
    });

    test("offers the report of a panic in the core straight away", async ({
      page,
    }) => {
      await page.goto("/settings/advanced");

      await crashTest(page, "Panic in the core").click();

      await expect(page.getByRole("alertdialog")).toContainText(
        "Panic: a crash test panicked on purpose",
      );
      expect(calls.panics).toBe(1);
    });

    test("offers the report of an interface error straight away", async ({
      page,
    }) => {
      await page.goto("/settings/advanced");

      await crashTest(page, "Throw an interface error").click();

      await expect(page.getByRole("alertdialog")).toContainText(
        INTERFACE_ERROR,
      );
      expect(calls.interfaceErrors.map((error) => error.message)).toEqual([
        INTERFACE_ERROR,
      ]);
    });

    test("crashes and quits only once asked and confirmed", async ({
      page,
    }) => {
      await page.goto("/settings/advanced");
      const dialog = await openCrashQuestion(page);
      expect(calls.crashes).toBe(0);

      await dialog.getByRole("button", { name: "Crash and quit" }).click();

      await expect(dialog).toBeHidden();
      await expect.poll(() => calls.crashes).toBe(1);
    });

    test("names the version and the development build in the crash question", async ({
      page,
    }) => {
      await page.goto("/settings/advanced");

      const dialog = await openCrashQuestion(page);

      await expect(dialog).toContainText("1.2.3 · Development build");
      await expect(dialog.locator("img")).toHaveCount(1);
      expect((await boxOf(dialog.locator("img"))).width).toBe(TILE);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`the page has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto("/settings/advanced");
        await expect(crashTests(page).getByRole("button")).toHaveCount(3);

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });

      test(`the crash question has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto("/settings/advanced");
        await openCrashQuestion(page);

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    }
  });
}

test.describe("the crash question on a screen with room for a dialog", () => {
  test.use({ backend: developmentBuild("linux", freshCalls()) });
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < MEDIUM_MIN_WIDTH,
    "screens with room for a dialog",
  );

  test("is a 420px card with Cancel and Crash and quit side by side at equal widths", async ({
    page,
  }) => {
    await page.goto("/settings/advanced");
    const dialog = await openCrashQuestion(page);

    const card = await boxOf(dialog);
    const cancel = await boxOf(dialog.getByRole("button", { name: "Cancel" }));
    const crash = await boxOf(
      dialog.getByRole("button", { name: "Crash and quit" }),
    );

    expect(card.width).toBe(DIALOG_WIDTH);
    expect(cancel.x + cancel.width).toBeLessThan(crash.x);
    expect(cancel.y).toBe(crash.y);
    expect(cancel.width).toBeCloseTo(crash.width, 0);
    expect([cancel.height, crash.height]).toEqual([
      DIALOG_BUTTON_HEIGHT,
      DIALOG_BUTTON_HEIGHT,
    ]);
  });
});

test.describe("the crash question on a phone", () => {
  test.use({ backend: developmentBuild("android", freshCalls()) });
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= MEDIUM_MIN_WIDTH,
    "phone-width screens only",
  );

  test("is a sheet with Crash and quit stacked above Cancel", async ({
    page,
  }) => {
    await page.goto("/settings/advanced");
    const dialog = await openCrashQuestion(page);
    const sheet = await boxOf(dialog);

    const crash = await boxOf(
      dialog.getByRole("button", { name: "Crash and quit" }),
    );
    const cancel = await boxOf(dialog.getByRole("button", { name: "Cancel" }));

    expect(sheet.y + sheet.height).toBeCloseTo(viewportOf(page).height, 0);
    expect(crash.y + crash.height).toBeLessThan(cancel.y);
    for (const button of [crash, cancel]) {
      expect(button.x).toBe(sheet.x + SHEET_INSET);
      expect(button.width).toBe(sheet.width - 2 * SHEET_INSET);
      expect(button.height).toBe(SHEET_BUTTON_HEIGHT);
    }
  });
});

for (const platform of ["android", "ios", "linux"] as const) {
  test.describe(`in a release build on ${platform}`, () => {
    test.use(onPlatform(platform));

    test("lists Advanced just above About, with no summary", async ({
      page,
    }) => {
      await page.goto("/settings");

      const group = sectionsHoldingAbout(page);

      await expect(group.getByRole("link").first()).toHaveAccessibleName(
        "Advanced",
      );
      await expect(group.getByRole("link")).toHaveCount(2);
    });

    test("opens Advanced without the development build note or the crash tests", async ({
      page,
    }) => {
      await page.goto("/settings/advanced");

      await expect(
        page.getByRole("heading", { level: 1, name: "Advanced" }),
      ).toBeVisible();
      await expect(page.getByRole("note")).toHaveCount(0);
      await expect(
        page.getByRole("region", { name: "Crash reports" }),
      ).toHaveCount(0);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`the page has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto("/settings/advanced");
        await expect(
          page.getByRole("heading", { level: 1, name: "Advanced" }),
        ).toBeVisible();

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    }
  });
}
