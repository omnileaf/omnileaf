import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import LibraryMore from "#lib/library/LibraryMore.svelte";
import { followCorePlatform } from "#lib/page/platform.ts";

import PlatformSurfacesHarness from "./PlatformSurfacesHarness.svelte";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };

async function openMenuOn(platform: Platform, theme: string): Promise<Element> {
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  await render(PlatformSurfacesHarness);
  await page.getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("menu");
  await expect.element(menu).toBeVisible();
  return menu.element();
}

function item(name: string): Element {
  return page.getByRole("menuitem", { name }).element();
}

function radio(name: string): Element {
  return page.getByRole("menuitemradio", { name }).element();
}

function rules(menu: Element): Element[] {
  return [...menu.querySelectorAll("[role=separator]")];
}

function checkOf(element: Element): Element {
  const check = element.querySelector("svg");
  if (check === null) {
    throw new Error("the radio item drew no check");
  }
  return check;
}

function style(element: Element): CSSStyleDeclaration {
  return getComputedStyle(element);
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws iOS's menu as a 32 rounded glass card of 40 tall capsule rows", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const menu = await openMenuOn("ios", "light");

  expect(style(menu).backgroundColor).toBe("rgba(248, 248, 250, 0.85)");
  expect(style(menu).borderTopLeftRadius).toBe("32px");
  expect(style(menu).padding).toBe("10px 8px");
  expect(style(menu).borderTopWidth).toBe("0px");
  expect(item("Mark read").getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(style(item("Mark read")).borderTopLeftRadius).toBe("999px");
  expect(style(item("Mark read")).fontSize).toBe("17px");
  expect(style(item("Mark read")).color).toBe("rgb(0, 0, 0)");
  expect(style(item("Delete")).color).toBe("rgb(155, 44, 44)");
});

test("lights an iOS menu row in the pressed fill without recolouring its words", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  await openMenuOn("ios", "light");

  await userEvent.hover(page.getByRole("menuitem", { name: "Rename" }));

  await expect
    .poll(() => style(item("Rename")).backgroundColor)
    .toBe("rgba(0, 0, 0, 0.05)");
  expect(style(item("Rename")).color).toBe("rgb(0, 0, 0)");
});

test.each<[Platform, string, string]>([
  ["ios", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.05)"],
  ["android", "rgb(192, 251, 255)", "rgba(44, 53, 46, 0.1)"],
])(
  "lays %s's pressed fill over the chosen item when it is highlighted",
  async (platform, chosenFill, pressedFill) => {
    await page.viewport(PHONE.width, PHONE.height);
    await openMenuOn(platform, "light");

    await userEvent.hover(page.getByRole("menuitemradio", { name: "Grid" }));

    await expect
      .poll(() => style(radio("Grid")).backgroundImage)
      .toContain(pressedFill);
    expect(style(radio("Grid")).backgroundColor).toBe(chosenFill);
  },
);

test("rules iOS's menu groups with an inset hairline and leads the check", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const menu = await openMenuOn("ios", "light");
  const [rule] = rules(menu);
  const grid = radio("Grid");

  expect(rule && style(rule).borderTopColor).toBe("rgba(60, 60, 67, 0.12)");
  expect(rule && style(rule).marginInline).toBe("16px");
  expect(rule && style(rule).marginBlock).toBe("10px");
  expect(checkOf(grid).getBoundingClientRect().left).toBeLessThan(
    page.getByText("Grid").element().getBoundingClientRect().left,
  );
  expect(style(checkOf(radio("List"))).visibility).toBe("hidden");
  expect(style(grid).backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

test("darkens iOS's menu for the dark theme", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const menu = await openMenuOn("ios", "dark");

  expect(style(menu).backgroundColor).toBe("rgba(26, 26, 26, 0.8)");
  expect(style(item("Mark read")).color).toBe("rgb(255, 255, 255)");
});

test("draws Android's menu as a 16 rounded card of 48 tall rows rounded 12 at each group's ends", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const menu = await openMenuOn("android", "light");

  expect(style(menu).backgroundColor).toBe("rgb(239, 245, 238)");
  expect(style(menu).borderTopLeftRadius).toBe("16px");
  expect(style(menu).padding).toBe("4px");
  expect(item("Mark read").getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(style(item("Mark read")).borderTopLeftRadius).toBe("12px");
  expect(style(item("Mark read")).borderBottomLeftRadius).toBe("4px");
  expect(style(item("Rename")).borderTopLeftRadius).toBe("4px");
  expect(style(item("Rename")).borderBottomLeftRadius).toBe("12px");
  expect(style(item("Delete")).borderTopLeftRadius).toBe("12px");
  expect(style(item("Delete")).color).toBe("rgb(168, 56, 54)");
  expect(style(item("Mark read")).color).toBe("rgb(44, 53, 46)");
});

test("fills Android's chosen item with the tertiary pill and shows only its check", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const menu = await openMenuOn("android", "light");
  const [rule] = rules(menu);
  const grid = radio("Grid");

  expect(style(grid).backgroundColor).toBe("rgb(192, 251, 255)");
  expect(style(grid).color).toBe("rgb(39, 98, 102)");
  expect(style(grid).borderTopLeftRadius).toBe("12px");
  expect(checkOf(grid).getBoundingClientRect().left).toBeLessThan(
    page.getByText("Grid").element().getBoundingClientRect().left,
  );
  expect(style(checkOf(radio("List"))).display).toBe("none");
  expect(rule && style(rule).borderTopColor).toBe("rgb(171, 180, 172)");
  expect(rule && style(rule).marginInline).toBe("12px");
  expect(rule && style(rule).marginBlock).toBe("4px");
});

test("darkens Android's menu and chosen pill for the dark theme", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const menu = await openMenuOn("android", "dark");

  expect(style(menu).backgroundColor).toBe("rgb(15, 21, 17)");
  expect(style(radio("Grid")).backgroundColor).toBe("rgb(187, 245, 249)");
  expect(style(item("Mark read")).color).toBe("rgb(222, 232, 223)");
});

test("draws a long-pressed context menu as Android draws its menu", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("android");
  await render(PlatformSurfacesHarness);

  await userEvent.click(page.getByText("Cover"), { button: "right" });
  const menu = page.getByRole("menu");
  await expect.element(menu).toBeVisible();

  expect(style(menu.element()).borderTopLeftRadius).toBe("16px");
  expect(style(menu.element()).padding).toBe("4px");
  expect(item("Open").getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(style(item("Open")).borderBottomLeftRadius).toBe("12px");
  expect(style(item("Remove")).borderTopLeftRadius).toBe("12px");
});

test.each<[Platform, number, string]>([
  ["ios", 40, "999px"],
  ["android", 48, "12px"],
])(
  "draws the library's more menu as %s draws its menu",
  async (platform, rowHeight, firstCorner) => {
    await page.viewport(PHONE.width, PHONE.height);
    document.documentElement.dataset.theme = "light";
    followCorePlatform(platform);
    document.body.append(document.createElement("main"));
    await render(LibraryMore, { keepsLabels: false, onSelect: () => {} });

    await page.getByRole("button", { name: "More for the library" }).click();
    const first = page.getByRole("menuitem").first().element();

    expect(first.getBoundingClientRect().height).toBeCloseTo(rowHeight, 0);
    expect(style(first).borderTopLeftRadius).toBe(firstCorner);
  },
);

test("keeps today's menu on Linux at a phone's width", async () => {
  await page.viewport(PHONE.width, PHONE.height);

  const menu = await openMenuOn("linux", "light");

  expect(
    [menu, item("Mark read"), ...rules(menu)]
      .map((element) => element.className)
      .join(" "),
  ).not.toContain("native");
  expect(style(menu).borderTopLeftRadius).toBe("8px");
  expect(style(menu).padding).toBe("4px");
});

test("keeps today's menu on an iOS tablet", async () => {
  await page.viewport(TABLET.width, TABLET.height);

  const menu = await openMenuOn("ios", "light");

  expect(style(menu).borderTopLeftRadius).toBe("14px");
  expect(item("Mark read").getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(checkOf(radio("Grid")).getBoundingClientRect().left).toBeGreaterThan(
    page.getByText("Grid").element().getBoundingClientRect().left,
  );
});

test("keeps today's menu on an Android tablet", async () => {
  await page.viewport(TABLET.width, TABLET.height);

  const menu = await openMenuOn("android", "light");

  expect(style(menu).borderTopLeftRadius).toBe("4px");
  expect(style(menu).padding).toBe("8px 0px");
  expect(style(item("Mark read")).borderTopLeftRadius).toBe("0px");
  expect(style(radio("Grid")).backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

const DESKTOP_WINDOW = { width: 1280, height: 800 };

interface WindowsMenuLook {
  readonly flyout: string;
  readonly edge: string;
  readonly lift: string;
  readonly ink: string;
  readonly hover: string;
  readonly muted: string;
}

const WINDOWS_MENUS = {
  light: {
    flyout: "rgba(252, 252, 252, 0.85)",
    edge: "rgba(0, 0, 0, 0.06)",
    lift: "rgba(0, 0, 0, 0.14) 0px 8px 16px 0px",
    ink: "rgba(0, 0, 0, 0.894)",
    hover: "rgba(0, 0, 0, 0.035)",
    muted: "rgba(0, 0, 0, 0.62)",
  },
  dark: {
    flyout: "rgba(44, 44, 44, 0.96)",
    edge: "rgba(0, 0, 0, 0.2)",
    lift: "rgba(0, 0, 0, 0.26) 0px 8px 16px 0px",
    ink: "rgb(255, 255, 255)",
    hover: "rgba(255, 255, 255, 0.06)",
    muted: "rgba(255, 255, 255, 0.773)",
  },
} as const satisfies Record<"light" | "dark", WindowsMenuLook>;

for (const [theme, look] of Object.entries(WINDOWS_MENUS)) {
  test(`draws Windows's MenuFlyout in the ${theme} theme on acrylic with an 8 corner, a flyout edge and lift`, async () => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);

    const menu = await openMenuOn("windows", theme);

    expect(style(menu).backgroundColor).toBe(look.flyout);
    expect(style(menu).borderTopColor).toBe(look.edge);
    expect(style(menu).borderTopWidth).toBe("1px");
    expect(style(menu).borderTopLeftRadius).toBe("8px");
    expect(style(menu).boxShadow).toContain(look.lift);
    expect(style(item("Mark read")).color).toBe(look.ink);
  });

  test(`lights a Windows menu item in the ${theme} theme's subtle fill and keeps its words at full strength`, async () => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
    await openMenuOn("windows", theme);

    await userEvent.hover(page.getByRole("menuitem", { name: "Rename" }));

    await expect
      .poll(() => style(item("Rename")).backgroundColor)
      .toBe(look.hover);
    expect(style(item("Rename")).color).toBe(look.ink);
  });

  test(`trails a Windows menu item's accelerator in muted caption text in the ${theme} theme`, async () => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
    await openMenuOn("windows", theme);
    const remove = item("Delete");
    const accelerator = remove.querySelector("kbd");
    if (accelerator === null) {
      throw new Error("the Delete item drew no accelerator");
    }

    const keyStyle = style(accelerator);

    expect(keyStyle.color).toBe(look.muted);
    expect(keyStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(keyStyle.fontSize).toBe("12px");
    expect(keyStyle.fontWeight).toBe("400");
    expect(keyStyle.paddingInlineStart).toBe("24px");
    expect(accelerator.getBoundingClientRect().right).toBeCloseTo(
      remove.getBoundingClientRect().right - 11,
      0,
    );
  });
}

test("blurs what lies under Windows's menu as acrylic does", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);

  const menu = await openMenuOn("windows", "light");

  expect(style(menu).backdropFilter).toBe("blur(30px)");
});

test("insets Windows's menu items 4 from the flyout's sides, 2 apart, with 4 corners", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);

  const menu = await openMenuOn("windows", "light");
  const markRead = item("Mark read");

  expect(style(menu).padding).toBe("2px 0px");
  expect(style(markRead).margin).toBe("2px 4px");
  expect(style(markRead).paddingInline).toBe("11px");
  expect(style(markRead).borderTopLeftRadius).toBe("4px");
  expect(style(markRead).fontSize).toBe("14px");
  expect(markRead.getBoundingClientRect().height).toBeCloseTo(32, 0);
});

test("draws a Windows menu's destructive item in plain text, as WinUI's menus have no red", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);

  await openMenuOn("windows", "light");

  expect(style(item("Delete")).color).toBe(WINDOWS_MENUS.light.ink);
});

test("runs Windows's menu rules edge to edge, 1 above and below, and leads a chosen item's check", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);

  const menu = await openMenuOn("windows", "light");
  const [rule] = rules(menu);
  const grid = radio("Grid");

  expect(rule && style(rule).marginInline).toBe("0px");
  expect(rule && style(rule).marginBlock).toBe("1px");
  expect(rule && style(rule).borderTopColor).toBe(WINDOWS_MENUS.light.edge);
  expect(checkOf(grid).getBoundingClientRect().left).toBeLessThan(
    page.getByText("Grid").element().getBoundingClientRect().left,
  );
  expect(style(checkOf(radio("List"))).visibility).toBe("hidden");
  expect(style(grid).backgroundColor).toBe("rgba(0, 0, 0, 0)");
});
