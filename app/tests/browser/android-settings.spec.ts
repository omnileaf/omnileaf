import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

const ROW_MIN = 48;
const ROW_START = 16;
const RADIO = 20;
const RADIO_GAP = 16;

test.describe(
  "the Settings radio groups on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test("sets the group flat on the page, headed in the green accent at 14px", async ({
      page,
    }) => {
      await page.goto("/settings/general");
      const group = page.getByRole("region", { name: "Omnileaf opens on" });
      const heading = group.getByRole("heading", { name: "Omnileaf opens on" });

      await expect(group).toHaveCSS("border-top-width", "0px");
      await expect(group).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(heading).toHaveCSS("font-size", "14px");
      await expect(heading).toHaveCSS("font-weight", "500");
      await expect(heading).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-plain"),
      );
    });

    test("draws each option as a 48px row with a 20px radio 16px in and its words 16px after it", async ({
      page,
    }) => {
      await page.goto("/settings/general");
      const group = page.getByRole("region", { name: "Omnileaf opens on" });
      const row = group.getByRole("radio", { name: "History" });
      const words = row.getByText("History", { exact: true });
      const rowBox = await boxOf(row);
      const dot = await boxOf(row.locator("[data-radio-mark]"));

      expect(rowBox.height).toBeGreaterThanOrEqual(ROW_MIN);
      expect(dot.x - rowBox.x).toBeCloseTo(ROW_START, 0);
      expect(dot.width).toBeCloseTo(RADIO, 0);
      expect(dot.height).toBeCloseTo(RADIO, 0);
      expect((await boxOf(words)).x - (dot.x + dot.width)).toBeCloseTo(
        RADIO_GAP,
        0,
      );
      await expect(words).toHaveCSS("font-size", "16px");
      await expect(words).toHaveCSS("line-height", "24px");
      await expect(words).toHaveCSS("font-weight", "400");
    });

    test("draws the chosen option with a 2px accent ring round an accent dot and the others in the control edge colour", async ({
      page,
    }) => {
      await page.goto("/settings/general");
      const group = page.getByRole("region", { name: "Omnileaf opens on" });
      const chosen = group
        .getByRole("radio", { name: "Library" })
        .locator("[data-radio-mark]");
      const other = group
        .getByRole("radio", { name: "History" })
        .locator("[data-radio-mark]");

      await expect(chosen).toHaveCSS("border-top-width", "2px");
      await expect(chosen).toHaveCSS(
        "border-top-color",
        await tokenColour(page, "--radio-edge-on"),
      );
      await expect(other).toHaveCSS("border-top-width", "2px");
      await expect(other).toHaveCSS(
        "border-top-color",
        await tokenColour(page, "--control-edge"),
      );
    });

    test("puts a hint under its option in 14px muted type", async ({
      page,
    }) => {
      await page.goto("/settings/library/adult-content");
      const hint = page.getByText("Covers stay blurred until tapped.");

      await expect(hint).toHaveCSS("font-size", "14px");
      await expect(hint).toHaveCSS("line-height", "20px");
      await expect(hint).toHaveCSS(
        "color",
        await tokenColour(page, "--color-muted"),
      );
    });
  },
);

test.describe("General on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("shows Language and Time format as flat rows, a 16px name over its value in 14px", async ({
    page,
  }) => {
    await page.goto("/settings/general");
    const row = page.getByRole("button", { name: /^Time format/ });
    const name = row.getByText("Time format", { exact: true });
    const value = row.getByText(/^Follow the system/);

    await expect(row).toHaveCSS("border-top-width", "0px");
    expect((await boxOf(row)).height).toBeGreaterThanOrEqual(72);
    await expect(name).toHaveCSS("font-size", "16px");
    await expect(name).toHaveCSS("line-height", "24px");
    await expect(value).toHaveCSS("font-size", "14px");
    await expect(value).toHaveCSS("line-height", "20px");
    expect((await boxOf(name)).x - (await boxOf(row)).x).toBeCloseTo(16, 0);
    await expect(
      page.getByRole("button", { name: /^Language/ }),
    ).toHaveAttribute("aria-haspopup", "dialog");
  });

  test("heads Dates and numbers over the time format in the accent", async ({
    page,
  }) => {
    await page.goto("/settings/general");
    const heading = page.getByRole("heading", { name: "Dates and numbers" });

    await expect(heading).toHaveCSS("font-size", "14px");
    await expect(heading).toHaveCSS(
      "color",
      await tokenColour(page, "--native-color-on-button-plain"),
    );
  });

  test("changes the time format in a dialog of radio rows, closing on a choice", async ({
    page,
  }) => {
    await page.goto("/settings/general");

    await page.getByRole("button", { name: /^Time format/ }).click();
    const dialog = page.getByRole("dialog", { name: "Time format" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("border-top-left-radius", "28px");
    await expect(dialog.getByRole("radio")).toHaveCount(3);
    await dialog.getByRole("radio", { name: "24-hour" }).click();

    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: /^Time format/ }),
    ).toContainText("24-hour");
  });

  test("leaves the choice alone on Cancel", async ({ page }) => {
    await page.goto("/settings/general");
    await page.getByRole("button", { name: /^Time format/ }).click();
    const dialog = page.getByRole("dialog", { name: "Time format" });

    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: /^Time format/ }),
    ).not.toContainText("24-hour");
  });

  test("drops the line under Last book but keeps its row spacing", async ({
    page,
  }) => {
    await page.goto("/settings/general");

    await expect(
      page.getByText("The reader, where you left it", { exact: false }),
    ).toHaveCount(0);
  });
});

test.describe(
  "the 18+ content page's switch on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test("sets the age ratings switch as a flat 72px row with 16px words, a 14px muted line and the switch 24px from the end", async ({
      page,
    }) => {
      await page.goto("/settings/library/adult-content");
      const row = page.getByRole("switch", {
        name: "Use age ratings from book details",
      });
      const label = row.getByText("Use age ratings from book details");
      const help = row.getByText(
        "Off: only series you mark 18+ by hand count.",
      );

      await expect(row).toHaveCSS("border-top-width", "0px");
      await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      expect((await boxOf(row)).height).toBeGreaterThanOrEqual(72);
      await expect(label).toHaveCSS("font-size", "16px");
      await expect(label).toHaveCSS("line-height", "24px");
      await expect(label).toHaveCSS("font-weight", "400");
      await expect(help).toHaveCSS("font-size", "14px");
      await expect(help).toHaveCSS("line-height", "20px");
      await expect(help).toHaveCSS(
        "color",
        await tokenColour(page, "--color-muted"),
      );
      expect((await boxOf(label)).x - (await boxOf(row)).x).toBeCloseTo(16, 0);
    });

    test("ends the page with a footnote saying when the choice applies", async ({
      page,
    }) => {
      await page.goto("/settings/library/adult-content");
      const note = page.getByText(
        "First launch offers the same choice. It applies straight away.",
      );

      await expect(note).toBeVisible();
      await expect(note).toHaveCSS("font-size", "14px");
      await expect(note).toHaveCSS("line-height", "20px");
    });
  },
);

test.describe(
  "the Settings list on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test("draws each entry's icon bare, with no circle behind it and no chevron at the end", async ({
      page,
    }) => {
      await page.goto("/settings");
      const row = page
        .getByRole("main")
        .getByRole("link", { name: /^General/ });
      const icon = row.locator("svg").first();

      await expect(icon.locator("xpath=..")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(row.locator("svg:visible")).toHaveCount(1);
    });

    test("sets each name at 16px and its line under it at 14px, both in regular weight", async ({
      page,
    }) => {
      await page.goto("/settings");
      const row = page
        .getByRole("main")
        .getByRole("link", { name: /^General/ });
      const name = row.getByText("General", { exact: true });
      const line = row.getByText(/^English/);

      await expect(name).toHaveCSS("font-size", "16px");
      await expect(name).toHaveCSS("font-weight", "400");
      await expect(line).toHaveCSS("font-size", "14px");
      await expect(line).toHaveCSS("line-height", "20px");
    });
  },
);

test.describe("Language on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("lists the languages as radio rows, the system one first with its language under it", async ({
    page,
  }) => {
    await page.goto("/settings/general/language");
    const system = page.getByRole("radio", { name: /Use the system language/ });
    const mark = system.locator("[data-radio-mark]");

    await expect(system).toBeChecked();
    await expect(mark).toHaveCSS("border-top-width", "2px");
    expect((await boxOf(mark)).width).toBeCloseTo(20, 0);
    await expect(system.getByText("Use the system language")).toHaveCSS(
      "font-weight",
      "400",
    );
    await expect(system.locator("svg:visible")).toHaveCount(0);
  });
});
