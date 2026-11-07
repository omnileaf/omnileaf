import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { screenshotModeTurned } from "../../../tests/components/screenshot-mode";
import WithAppContext from "../../../tests/components/WithAppContext.svelte";
import ReadingSettingsHarness from "./ReadingSettingsHarness.svelte";

const SheetWithAppContext = WithAppContext<{ platform: Platform }>;

const PHONE = { width: 400, height: 800 };
const SIDE_PADDING = "16px";

async function openSheet(platform: Platform): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await page.viewport(PHONE.width, PHONE.height);
  await render(SheetWithAppContext, {
    screenshotMode: screenshotModeTurned("off"),
    page: ReadingSettingsHarness,
    pageProps: { platform },
  });
}

function title(): HTMLElement {
  const element = page
    .getByRole("heading", { name: "Reading settings" })
    .element();
  if (!(element instanceof HTMLElement)) {
    throw new Error("the sheet drew no title");
  }
  return element;
}

function scrim(): HTMLElement {
  const element = document.querySelector("[data-dialog-overlay]");
  if (!(element instanceof HTMLElement)) {
    throw new Error("the sheet drew no backdrop");
  }
  return element;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("heads Android's Reading settings sheet with a 22 title alone and no scrim", async () => {
  await openSheet("android");
  const style = getComputedStyle(title());

  expect(style.fontSize).toBe("22px");
  expect(style.lineHeight).toBe("28px");
  expect(style.fontWeight).toBe("400");
  expect(
    page.getByRole("button", { name: "Done", exact: true }).elements(),
  ).toHaveLength(0);
  expect(title().parentElement?.querySelector("svg, [data-icon]")).toBeNull();
  expect(getComputedStyle(scrim()).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(title().parentElement as Element).paddingLeft).toBe(
    SIDE_PADDING,
  );
});

test("keeps the badge, the Done button and the scrim on the other platforms", async () => {
  await openSheet("linux");

  expect(
    page.getByRole("button", { name: "Done", exact: true }).elements(),
  ).toHaveLength(1);
  expect(title().parentElement?.querySelector("svg")).not.toBeNull();
  expect(getComputedStyle(scrim()).backgroundColor).not.toBe(
    "rgba(0, 0, 0, 0)",
  );
});
