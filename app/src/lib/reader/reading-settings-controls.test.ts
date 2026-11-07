import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { screenshotModeTurned } from "../../../tests/components/screenshot-mode";
import WithAppContext from "../../../tests/components/WithAppContext.svelte";
import ReadingSettingsHarness from "./ReadingSettingsHarness.svelte";

const SheetWithAppContext = WithAppContext<{
  platform: Platform;
  canUseMyPace?: boolean;
}>;

const PHONE = { width: 400, height: 800 };
const TABLET = { width: 900, height: 800 };

async function openSheet(
  platform: Platform,
  size = PHONE,
  canUseMyPace = true,
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await page.viewport(size.width, size.height);
  await render(SheetWithAppContext, {
    screenshotMode: screenshotModeTurned("off"),
    page: ReadingSettingsHarness,
    pageProps: { platform, canUseMyPace },
  });
}

function asElement(element: Element): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("the settings drew no element");
  }
  return element;
}

function group(name: string): HTMLElement {
  return asElement(page.getByRole("radiogroup", { name }).element());
}

function label(text: string): HTMLElement {
  return asElement(page.getByText(text, { exact: true }).first().element());
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws Android's phone settings as one row of 40px pills under their label", async () => {
  await openSheet("android");

  const fit = group("Fit").getBoundingClientRect();
  const sheetBody = group("Fit").parentElement?.getBoundingClientRect();
  const segments = page.getByRole("radio").elements();
  const screen = asElement(
    page.getByRole("radio", { name: /^Screen/ }).element(),
  );

  expect(screen.getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(segments.length).toBeGreaterThan(8);
  expect(label("Fit").getBoundingClientRect().bottom).toBeLessThanOrEqual(
    fit.top,
  );
  expect(sheetBody?.width).toBeGreaterThanOrEqual(fit.width);
  expect(
    new Set(
      Array.from(group("Fit").children)
        .filter((child) => child.getAttribute("role") === "radio")
        .map((child) => Math.round(child.getBoundingClientRect().top)),
    ).size,
  ).toBe(1);
});

test.each([
  ["android", TABLET],
  ["ios", PHONE],
  ["linux", PHONE],
] as const)(
  "keeps the toggle group on %s at this width",
  async (platform, size) => {
    await openSheet(platform, size);

    expect(
      document.querySelectorAll('[data-slot="toggle-group"]').length,
    ).toBeGreaterThan(4);
    expect(page.getByRole("radiogroup").elements()).toHaveLength(0);
  },
);

test("greys out My pace on Android when the series has no pace to follow", async () => {
  await openSheet("android", PHONE, false);
  await page
    .getByRole("combobox", { name: "Reading mode" })
    .selectOptions("longStrip");

  const myPace = page.getByRole("radio", { name: /^My pace/ });

  await expect.element(myPace).toBeDisabled();
});

function accentColour(): string {
  const probe = document.createElement("span");
  probe.className = "text-accent";
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  return color;
}

function heading(name: string): HTMLElement {
  return asElement(page.getByRole("heading", { name, level: 3 }).element());
}

function settingRowEdges(): string[] {
  return Array.from(document.querySelectorAll('[data-slot="setting-row"]')).map(
    (row) => {
      const style = getComputedStyle(row);
      return `${style.borderTopWidth} ${style.borderBottomWidth}`;
    },
  );
}

test("sets Android's section headings at 14 over 20 in medium weight and the accent", async () => {
  await openSheet("android");
  const style = getComputedStyle(heading("Pages"));

  expect(style.fontSize).toBe("14px");
  expect(style.lineHeight).toBe("20px");
  expect(style.fontWeight).toBe("500");
  expect(style.color).toBe(accentColour());
});

test("sets Android's settings flush at 16px with no dividers between them", async () => {
  await openSheet("android");

  expect(group("Fit").getBoundingClientRect().left).toBeCloseTo(16, 0);
  expect(heading("Pages").getBoundingClientRect().left).toBeCloseTo(16, 0);
  expect(new Set(settingRowEdges())).toEqual(new Set(["0px 0px"]));
});

test.each([
  ["android", TABLET],
  ["ios", PHONE],
  ["linux", PHONE],
] as const)(
  "keeps %s's semibold headings and divided rows at this width",
  async (platform, size) => {
    await openSheet(platform, size);

    expect(getComputedStyle(heading("Pages")).fontWeight).toBe("600");
    expect(new Set(settingRowEdges()).size).toBeGreaterThan(1);
  },
);
