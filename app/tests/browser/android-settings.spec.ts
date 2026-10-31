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
