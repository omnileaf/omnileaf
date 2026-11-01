import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import { followCorePlatform } from "#lib/page/platform.ts";

import TabsHarness from "./TabsHarness.svelte";

const PHONE_WIDTH = 390;
const SMALLEST_PHONE_WIDTH = 320;
const TABLET_WIDTH = 820;
const DESKTOP_WIDTH = 1280;
const HEIGHT = 800;
const LARGE_TEXT_SCALE = "2";
const TAB_HEIGHT = 48;
const INDICATOR_HEIGHT = 3;
const INDICATOR_INSET = 16;
const LAYOUT_ROUNDING_PX = 1;
const THEMES = ["light", "dark"] as const;
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const GROUND_PADDING = "var(--spacing-page-start)";

async function tabsOnAndroid(
  theme: string,
  width: number,
  props: Parameters<typeof render<typeof TabsHarness>>[1] = {},
) {
  document.documentElement.dataset.theme = theme;
  followCorePlatform("android");
  await page.viewport(width, HEIGHT);
  document.body.style.paddingInline = GROUND_PADDING;
  await render(TabsHarness, props);
  return {
    list: page.getByRole("tablist").element(),
    tabs: page
      .getByRole("tab")
      .elements()
      .map((tab) => tab as HTMLElement),
  };
}

function widthOf(element: Element): number {
  return element.getBoundingClientRect().width;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty("--text-scale");
  document.body.style.removeProperty("padding-inline");
  document.body.replaceChildren();
});

for (const theme of THEMES) {
  test(`runs an Android phone's tabs edge to edge, ruled underneath with no track in the ${theme} theme`, async () => {
    const { list } = await tabsOnAndroid(theme, PHONE_WIDTH);

    const style = getComputedStyle(list);

    expect(list.getBoundingClientRect().left).toBe(0);
    expect(widthOf(list)).toBe(PHONE_WIDTH);
    expect(style.backgroundColor).toBe(TRANSPARENT);
    expect(style.borderBottomWidth).toBe("1px");
    expect(style.borderBottomColor).toBe(
      resolvedColour("--native-color-tab-rule", "color"),
    );
    expect(style.borderTopLeftRadius).toBe("0px");
  });

  test(`shares an Android phone's width between equal 48px tabs in the ${theme} theme`, async () => {
    const { list, tabs } = await tabsOnAndroid(theme, PHONE_WIDTH);

    const widths = tabs.map(widthOf);

    expect(tabs).toHaveLength(3);
    for (const tab of tabs) {
      expect(tab.getBoundingClientRect().height).toBeCloseTo(TAB_HEIGHT, 0);
    }
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(
      LAYOUT_ROUNDING_PX,
    );
    expect(widths.reduce((sum, one) => sum + one, 0)).toBeCloseTo(
      widthOf(list),
      0,
    );
  });

  test(`inks the chosen Android tab in the accent and the others muted, all at one weight in the ${theme} theme`, async () => {
    const { tabs } = await tabsOnAndroid(theme, PHONE_WIDTH);
    const [chosen, other] = tabs.map((tab) => getComputedStyle(tab));

    expect(chosen?.color).toBe(
      resolvedColour("--native-color-on-tab-current", "color"),
    );
    expect(other?.color).toBe(resolvedColour("--native-color-on-tab", "color"));
    expect(chosen?.fontWeight).toBe(other?.fontWeight);
    expect(chosen?.fontSize).toBe("14px");
    expect(chosen?.lineHeight).toBe("20px");
    expect(chosen?.backgroundColor).toBe(TRANSPARENT);
    expect(chosen?.boxShadow).toBe("none");
  });

  test(`underlines only the chosen Android tab with a 3px accent line in the ${theme} theme`, async () => {
    const { tabs } = await tabsOnAndroid(theme, PHONE_WIDTH);
    const [chosen, other] = tabs;

    const line = getComputedStyle(chosen as Element, "::after");

    expect(line.height).toBe(`${String(INDICATOR_HEIGHT)}px`);
    expect(Number.parseFloat(line.width)).toBeCloseTo(
      widthOf(chosen as Element) - 2 * INDICATOR_INSET,
      0,
    );
    expect(line.backgroundColor).toBe(
      resolvedColour("--native-color-tab-indicator", "color"),
    );
    expect([
      line.borderTopLeftRadius,
      line.borderTopRightRadius,
      line.borderBottomRightRadius,
      line.borderBottomLeftRadius,
    ]).toEqual(["3px", "3px", "0px", "0px"]);
    expect(getComputedStyle(other as Element, "::after").content).toBe("none");
  });
}

test("moves the underline to the Android tab chosen without moving the others", async () => {
  const { tabs } = await tabsOnAndroid("light", PHONE_WIDTH);
  const widthsBefore = tabs.map(widthOf);

  await page.getByRole("tab", { name: "Chapters" }).click();

  expect(tabs.map(widthOf)).toEqual(widthsBefore);
  expect(getComputedStyle(tabs[1] as Element, "::after").height).toBe("3px");
  expect(getComputedStyle(tabs[0] as Element, "::after").content).toBe("none");
});

test("moves between Android tabs with the arrow keys", async () => {
  await tabsOnAndroid("light", PHONE_WIDTH);
  const volumes = page.getByRole("tab", { name: "Volumes" });
  volumes.element().focus();

  await userEvent.keyboard("{ArrowRight}");

  await expect
    .element(page.getByRole("tab", { name: "Chapters" }))
    .toHaveFocus();
});

test("keeps three long labels whole at 320 and 2x text, wrapping them inside equal tabs", async () => {
  document.documentElement.style.setProperty("--text-scale", LARGE_TEXT_SCALE);
  const { list, tabs } = await tabsOnAndroid("light", SMALLEST_PHONE_WIDTH, {
    names: ["Volumes 12", "Chapitres 120", "Hors-séries spéciaux 2"],
  });

  const widths = tabs.map(widthOf);
  const heights = tabs.map((tab) => tab.getBoundingClientRect().height);

  expect(list.scrollWidth).toBe(list.clientWidth);
  for (const tab of tabs) {
    expect(tab.scrollWidth).toBeLessThanOrEqual(tab.clientWidth);
  }
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(
    LAYOUT_ROUNDING_PX,
  );
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(
    LAYOUT_ROUNDING_PX,
  );
  expect(Math.min(...heights)).toBeGreaterThan(TAB_HEIGHT);
});

for (const [name, width] of [
  ["tablet", TABLET_WIDTH],
  ["desktop", DESKTOP_WIDTH],
] as const) {
  test(`keeps Android's chip track with a raised chosen tab on a ${name}`, async () => {
    const { list, tabs } = await tabsOnAndroid("light", width);
    const [chosen] = tabs;

    expect(getComputedStyle(list).backgroundColor).toBe(
      resolvedColour("--color-chip", "backgroundColor"),
    );
    expect(getComputedStyle(chosen as Element).backgroundColor).toBe(
      resolvedColour("--color-raised", "backgroundColor"),
    );
    expect(getComputedStyle(chosen as Element, "::after").content).toBe("none");
    expect(list.getBoundingClientRect().left).toBeGreaterThan(0);
  });
}
