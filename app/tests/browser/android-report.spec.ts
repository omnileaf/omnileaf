import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

const SETTINGS_RULE_WIDTH = 1;

const ROWS = [
  { name: "Version and device", icon: "info" },
  { name: "Log", icon: "scroll-text" },
  { name: "Open on GitHub", icon: "globe" },
  { name: "Copy report", icon: "copy" },
  { name: "Save as a file", icon: "save" },
] as const;

test.describe(
  "Report a problem on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's fields and buttons");
    });

    test("draws the reply email as a 56px outlined field with a 4px corner, flat on the page", async ({
      page,
    }) => {
      await page.goto("/settings/about/report");
      const field = page.getByRole("textbox", {
        name: "Email for a reply (optional)",
      });

      expect((await boxOf(field)).height).toBeCloseTo(56, 0);
      await expect(field).toHaveCSS("border-top-left-radius", "4px");
      await expect(field).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(field.locator("xpath=..").first()).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
    });

    test("fills Send to Omnileaf in the accent, full width", async ({
      page,
    }) => {
      await page.goto("/settings/about/report");
      const send = page.getByRole("button", { name: "Send to Omnileaf" });

      await expect(send).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-button-primary"),
      );
    });

    for (const { name, icon } of ROWS) {
      test(`sets ${name} flush as a Settings row, its bare 24px icon at x=16 and its name at x=56`, async ({
        page,
      }) => {
        await page.goto("/settings/about/report");
        const row = page
          .getByRole("listitem")
          .filter({ has: page.getByText(name, { exact: true }) });
        const label = row.getByText(name, { exact: true });

        const glyph = await boxOf(row.locator(`[data-icon=${icon}]`));

        expect(glyph.x).toBe(16);
        expect(glyph.width).toBe(24);
        expect((await boxOf(label)).x).toBe(56);
        expect((await boxOf(row)).x).toBe(0);
        await expect(label).toHaveCSS("font-size", "16px");
        await expect(label).toHaveCSS("font-weight", "400");
      });
    }

    test("draws no line between the rows inside either group", async ({
      page,
    }) => {
      await page.goto("/settings/about/report");
      const rows = page.getByRole("main").getByRole("listitem");
      await expect(rows).toHaveCount(ROWS.length);

      const edges = await rows.evaluateAll((items) =>
        items.flatMap((item) => [
          getComputedStyle(item).borderTopWidth,
          getComputedStyle(item).borderBottomWidth,
        ]),
      );

      expect(new Set(edges)).toEqual(new Set(["0px"]));
    });

    test("heads Other ways to send it like a Settings group, in the accent straight under its line", async ({
      page,
    }) => {
      await page.goto("/settings/about/report");
      const group = page.getByRole("region", { name: "Other ways to send it" });
      const heading = group.getByRole("heading", {
        name: "Other ways to send it",
      });
      const firstRow = group.getByRole("listitem").first();

      const headingBox = await boxOf(heading);

      expect(headingBox.y - (await boxOf(group)).y).toBeCloseTo(
        SETTINGS_RULE_WIDTH,
        0,
      );
      expect((await boxOf(firstRow)).y).toBeCloseTo(
        headingBox.y + headingBox.height,
        0,
      );
      await expect(heading).toHaveCSS("padding-top", "16px");
      await expect(heading).toHaveCSS("padding-bottom", "8px");
      await expect(heading).toHaveCSS("font-size", "14px");
      await expect(heading).toHaveCSS(
        "color",
        await tokenColour(page, "--color-accent"),
      );
    });
  },
);
