import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  expect,
  sidewaysOverflow,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";

const WINDOW = { width: 1280, height: 800 };
const PAGE_WIDEST = 640;
const GROUP_GAP = 16;
const HEADING_TO_GROUP = 4;
const PLATE_RADIUS = "12px";
const PLATE_INSET = "10px";
const PLATE_BLOCK = "12px";
const ROW_GAP = "10px";
const MARK_SIZE = 16;
const MARK_TO_WORDS = "6px";
const DOT_SIZE = 4.8;
const TAB_STOPS_AT_MOST = 40;
const TITLE_TYPE = { fontSize: "13px", fontWeight: "510", lineHeight: "16px" };
const SUB_TYPE = { fontSize: "11px", lineHeight: "14px" };
const HEADING_TYPE = {
  fontSize: "11px",
  fontWeight: "590",
  lineHeight: "14px",
};

function section(page: Page, name: string): Locator {
  return page.getByRole("region", { name });
}

function group(page: Page, name: string): Locator {
  return page.getByRole("radiogroup", { name });
}

function nextGroup(group: Locator): Locator {
  return group.locator("xpath=following-sibling::*[1]");
}

function markOf(radio: Locator): Locator {
  return radio.locator("[data-radio-mark]");
}

async function tokenShadow(page: Page, token: `--${string}`): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.boxShadow = `var(${name})`;
    document.body.append(probe);
    const computed = getComputedStyle(probe).boxShadow;
    probe.remove();
    return computed;
  }, token);
}

function endingWith(value: string): RegExp {
  return new RegExp(
    `${value.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)}$`,
  );
}

async function focusByKeyboard(page: Page, target: Locator): Promise<void> {
  for (let presses = 0; presses < TAB_STOPS_AT_MOST; presses += 1) {
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

async function holdOn(page: Page, locator: Locator): Promise<void> {
  const box = await boxOf(locator);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

test.describe("a group of radio buttons on the General page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/general");
    await expect(group(page, "Omnileaf opens on")).toBeVisible();
  });

  test("sits in a rounded plate inset 10px with 12px above and below its rows", async ({
    page,
  }) => {
    const plate = group(page, "Omnileaf opens on");

    await expect(plate).toHaveCSS("border-radius", PLATE_RADIUS);
    await expect(plate).toHaveCSS("padding-left", PLATE_INSET);
    await expect(plate).toHaveCSS("padding-top", PLATE_BLOCK);
    await expect(plate).toHaveCSS("padding-bottom", PLATE_BLOCK);
    await expect(plate).toHaveCSS("row-gap", ROW_GAP);
    await expect(plate).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-group"),
    );
    await expect(section(page, "Omnileaf opens on")).toHaveCSS(
      "border-top-width",
      "0px",
    );
  });

  test("puts its heading above the plate in 11px 590 type", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { name: "Omnileaf opens on" });
    const above = await boxOf(heading);
    const plate = await boxOf(group(page, "Omnileaf opens on"));

    await expect(heading).toHaveCSS("font-size", HEADING_TYPE.fontSize);
    await expect(heading).toHaveCSS("font-weight", HEADING_TYPE.fontWeight);
    await expect(heading).toHaveCSS("line-height", HEADING_TYPE.lineHeight);
    await expect(heading).toHaveCSS("padding-left", "8px");
    expect(plate.y - (above.y + above.height)).toBe(HEADING_TO_GROUP);
  });

  test("hugs each row to its words instead of stretching it", async ({
    page,
  }) => {
    const plate = await boxOf(group(page, "Omnileaf opens on"));
    const row = await boxOf(
      group(page, "Omnileaf opens on").getByRole("radio", { name: "Library" }),
    );

    const words = await boxOf(
      group(page, "Omnileaf opens on")
        .getByRole("radio", { name: "Library" })
        .getByText("Library"),
    );

    expect(row.width).toBeLessThan(plate.width / 2);
    expect(row.width).toBeCloseTo(MARK_SIZE + 6 + words.width, 0);
  });

  test("draws the unchosen mark 16px with a white field and a rim", async ({
    page,
  }) => {
    const mark = markOf(page.getByRole("radio", { name: "History" }));

    expect((await boxOf(mark)).width).toBe(MARK_SIZE);
    expect((await boxOf(mark)).height).toBe(MARK_SIZE);
    await expect(mark).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-radio-field"),
    );
    await expect(mark).toHaveCSS("border-top-width", "0px");
  });

  for (const [name, colorScheme, contrast] of [
    ["light", "light", undefined],
    ["dark", "dark", undefined],
    ["light with Increase contrast", "light", "more"],
    ["dark with Increase contrast", "dark", "more"],
  ] as const) {
    test(`rims the unchosen mark and fills it with the field in ${name}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        colorScheme,
      );
      await page.evaluate((value) => {
        if (value !== undefined) {
          document.documentElement.setAttribute("data-contrast", value);
        }
      }, contrast);
      const mark = markOf(page.getByRole("radio", { name: "History" }));

      await expect(mark).toHaveCSS(
        "box-shadow",
        endingWith(await tokenShadow(page, "--native-shadow-radio-rim")),
      );
      await expect(mark).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-radio-field"),
      );
    });
  }

  test("fills the unchosen mark with the pressed fill while the mouse is held down", async ({
    page,
  }) => {
    const radio = page.getByRole("radio", { name: "History" });
    await holdOn(page, radio);

    await expect(markOf(radio)).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-control-fill-pressed"),
    );
    await page.mouse.up();
  });

  test("darkens the chosen mark with the hover fill while the mouse is held down", async ({
    page,
  }) => {
    const radio = page.getByRole("radio", { name: "Library" });
    await holdOn(page, radio);

    await expect(markOf(radio)).toHaveCSS(
      "box-shadow",
      endingWith(await tokenShadow(page, "--native-shadow-radio-pressed-on")),
    );
    await page.mouse.up();
  });

  for (const [name, contrast, width] of [
    ["", undefined, "3.5px"],
    [" with Increase contrast", "more", "2.5px"],
  ] as const) {
    test(`rings the mark and not the row when the keyboard focuses it${name}`, async ({
      page,
    }) => {
      await page.evaluate((value) => {
        if (value !== undefined) {
          document.documentElement.setAttribute("data-contrast", value);
        }
      }, contrast);
      const radio = page.getByRole("radio", { name: "Library" });
      await focusByKeyboard(page, radio);

      await expect(markOf(radio)).toHaveCSS("outline-style", "solid");
      const mark = markOf(radio);
      await expect(mark).toHaveCSS("--spacing-native-radio-focus-ring", width);
      const drawn = Number.parseFloat(
        await mark.evaluate(
          (element) => getComputedStyle(element).outlineWidth,
        ),
      );
      expect(drawn).toBeGreaterThanOrEqual(
        Math.floor(Number.parseFloat(width)),
      );
      expect(drawn).toBeLessThanOrEqual(Number.parseFloat(width));
      await expect(markOf(radio)).toHaveCSS(
        "outline-color",
        await tokenColour(page, "--native-color-focus-ring"),
      );
      await expect(radio).toHaveCSS("outline-width", "0px");
    });
  }

  test("fills the chosen mark with the accent and a 4.8px dot", async ({
    page,
  }) => {
    const mark = markOf(page.getByRole("radio", { name: "Library" }));

    await expect(mark).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-accent"),
    );
    await expect(mark).toHaveCSS("box-shadow", "none");
    const dot = await boxOf(mark.locator("span"));
    expect(dot.width).toBeCloseTo(DOT_SIZE, 1);
    await expect(mark.locator("span")).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-on-accent"),
    );
  });

  test("sets a row's words 6px after the mark in 13px 510 type", async ({
    page,
  }) => {
    const radio = page.getByRole("radio", { name: "Library" });

    await expect(radio).toHaveCSS("column-gap", MARK_TO_WORDS);
    await expect(radio).toHaveCSS("font-size", TITLE_TYPE.fontSize);
    await expect(radio).toHaveCSS("font-weight", TITLE_TYPE.fontWeight);
    await expect(radio).toHaveCSS("line-height", TITLE_TYPE.lineHeight);
  });
});

test.describe("a radio button with a line under it on the 18+ content page", () => {
  test("sets the line in 11px muted type", async ({ page }) => {
    await page.goto("/settings/library/adult-content");
    const hint = page.getByText("Covers stay blurred until clicked.");

    await expect(hint).toHaveCSS("font-size", SUB_TYPE.fontSize);
    await expect(hint).toHaveCSS("line-height", SUB_TYPE.lineHeight);
    await expect(hint).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
  });
});

test("shows no line under the General page's radio buttons yet keeps it for assistive technology", async ({
  page,
}) => {
  await page.goto("/settings/general");
  const radio = page.getByRole("radio", { name: "Last book" });
  const hint = page.getByText("The reader, where you left it");

  await expect(group(page, "Omnileaf opens on")).toBeVisible();
  await expect(radio).toHaveAccessibleDescription(
    /The reader, where you left it/,
  );
  const box = await boxOf(hint);
  expect(box.width).toBeLessThanOrEqual(1);
  expect(box.height).toBeLessThanOrEqual(1);
});

test.describe("the 18+ content page's lead line", () => {
  test("sits in 13px muted type 16px above the radio group", async ({
    page,
  }) => {
    await page.goto("/settings/library/adult-content");
    const lead = page.getByText("A series counts as 18+");
    const above = await boxOf(lead);
    const below = await boxOf(section(page, "18+ content"));

    await expect(lead).toHaveCSS("font-size", TITLE_TYPE.fontSize);
    await expect(lead).toHaveCSS("line-height", TITLE_TYPE.lineHeight);
    await expect(lead).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
    expect(below.y - (above.y + above.height)).toBe(GROUP_GAP);
  });
});

test.describe("the 18+ content page's age ratings switch", () => {
  const FOOTER =
    "First launch offers the same choice. It applies straight away.";

  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/library/adult-content");
    await expect(
      page.getByRole("switch", { name: "Use age ratings from book details" }),
    ).toBeVisible();
  });

  test("sits in a plate like the radio group's, not a bordered card", async ({
    page,
  }) => {
    const row = page.getByRole("switch", {
      name: "Use age ratings from book details",
    });

    await expect(row).toHaveCSS("border-top-width", "0px");
    await expect(row).toHaveCSS("border-radius", PLATE_RADIUS);
    await expect(row).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-group"),
    );
    await expect(row).toHaveCSS("padding-left", PLATE_INSET);
  });

  test("ends with a footer in 11px muted type", async ({ page }) => {
    const footer = page.getByText(FOOTER);

    await expect(footer).toBeVisible();
    await expect(footer).toHaveCSS("font-size", SUB_TYPE.fontSize);
    await expect(footer).toHaveCSS("line-height", SUB_TYPE.lineHeight);
    await expect(footer).toHaveCSS(
      "color",
      await tokenColour(page, "--color-muted"),
    );
  });
});

const SETTINGS_PAGES = [
  "/settings",
  "/settings/general",
  "/settings/general/language",
  "/settings/general/opens-on",
  "/settings/general/time-format",
  "/settings/library",
  "/settings/library/adult-content",
  "/settings/library/folders",
  "/settings/library/tabs",
  "/settings/library/tags",
  "/settings/reading",
  "/settings/appearance",
  "/settings/privacy",
  "/settings/privacy/permissions",
  "/settings/privacy/screenshot-mode",
  "/settings/advanced",
  "/settings/advanced/animations",
  "/settings/storage",
  "/settings/about",
  "/settings/about/licences",
  "/settings/about/report",
  "/settings/about/reports",
] as const;

test.describe("every settings page held to 640px", () => {
  for (const route of SETTINGS_PAGES) {
    test(`${route} keeps its content inside the window and the page`, async ({
      page,
    }) => {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      expect(await sidewaysOverflow(page)).toEqual([]);
    });
  }
});

test.describe("the page's groups", () => {
  test("stop at 640px wide", async ({ page }) => {
    await page.goto("/settings/general");

    expect((await boxOf(section(page, "Omnileaf opens on"))).width).toBe(
      PAGE_WIDEST,
    );
  });

  test("sit 16px apart", async ({ page }) => {
    await page.goto("/settings/general");
    const first = await boxOf(section(page, "Omnileaf opens on"));
    const second = await boxOf(nextGroup(section(page, "Omnileaf opens on")));

    expect(second.y - (first.y + first.height)).toBe(GROUP_GAP);
  });
});

for (const [name, platform, viewport] of [
  ["Windows", "windows", { width: 1600, height: 900 }],
  ["Linux", "linux", { width: 1600, height: 900 }],
  ["an iPad", "ios", { width: 1180, height: 820 }],
] as const) {
  test.describe(`on ${name}`, () => {
    test.use({ platform, viewport });

    test("keeps the radio group's card and no plate", async ({ page }) => {
      await page.goto("/settings/general");
      const plate = group(page, "Omnileaf opens on");

      await expect(section(page, "Omnileaf opens on")).toHaveCSS(
        "border-top-width",
        "1px",
      );
      await expect(
        markOf(page.getByRole("radio", { name: "History" })),
      ).toHaveCSS("border-top-width", "1px");
      await expect(plate).toHaveCSS("border-radius", "0px");
      await expect(plate).toHaveCSS("padding-left", "0px");
      await expect(
        page.getByText("The reader, where you left it"),
      ).toBeVisible();
    });
  });
}

test.describe("on Windows", () => {
  test.use({ platform: "windows", viewport: { width: 1600, height: 900 } });

  test("keeps the radio group's 720px width and 20px gaps", async ({
    page,
  }) => {
    await page.goto("/settings/general");
    const first = await boxOf(section(page, "Omnileaf opens on"));
    const second = await boxOf(nextGroup(section(page, "Omnileaf opens on")));

    expect(first.width).toBe(720);
    expect(second.y - (first.y + first.height)).toBe(20);
  });
});
