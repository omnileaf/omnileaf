import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import type { Platform } from "#lib/ipc/bindings.ts";

import AlertHarness from "./AlertHarness.svelte";
import type { AlertTone } from "./tones.ts";

const ICON_SIZE = 16;

async function showAlert(
  platform: Platform,
  tone: AlertTone,
  dismissible = true,
) {
  document.documentElement.dataset.platform = platform;
  document.documentElement.dataset.theme = "light";
  await render(AlertHarness, {
    tone,
    onDismiss: () => undefined,
    dismissible,
  });
  const title = page.getByText("Sample Comics looks empty").element();
  const alert = title.closest<HTMLElement>("[data-slot=alert]");
  if (alert === null) {
    throw new Error("the title sits outside an alert");
  }
  return {
    alert,
    title,
    icon: alert.querySelector(":scope > svg"),
    description: page.getByText("Nothing in your library changed.").element(),
  };
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test("rounds an alert to 10px and pads it 12px by 16px", async () => {
  const { alert } = await showAlert("linux", "plain");

  const style = getComputedStyle(alert);

  expect(style.borderTopLeftRadius).toBe("10px");
  expect(style.padding).toBe("12px 16px");
});

test("sets a 16px icon, a medium title and a muted description", async () => {
  const { icon, title, description } = await showAlert("linux", "plain");

  const box = icon?.getBoundingClientRect();

  expect([box?.width, box?.height]).toEqual([ICON_SIZE, ICON_SIZE]);
  expect(getComputedStyle(title).fontWeight).toBe("500");
  expect(getComputedStyle(description).color).toBe(
    resolvedColour("--secondary-text", "color"),
  );
  expect(getComputedStyle(description).fontSize).toBe("14px");
});

test("writes a warning's description in the warning's own ink", async () => {
  const { alert, description } = await showAlert("linux", "warning");

  expect(getComputedStyle(description).color).toBe(
    getComputedStyle(alert).color,
  );
});

const ANDROID_FILLS = {
  plain: "--android-container",
  warning: "--warning-soft",
} as const;

for (const tone of ["plain", "warning"] as const) {
  test(`lays a ${tone} alert on Android's ${tone === "plain" ? "tonal container" : "warning fill"} without an edge`, async () => {
    const { alert } = await showAlert("android", tone);

    const style = getComputedStyle(alert);

    expect(style.backgroundColor).toBe(
      resolvedColour(ANDROID_FILLS[tone], "backgroundColor"),
    );
    expect(style.borderTopWidth).toBe("0px");
    expect(style.borderTopLeftRadius).toBe("12px");
  });
}

const DISMISS_RESERVE = "32px";

test("keeps room for Android's corner dismiss button beside the text", async () => {
  const { title, description } = await showAlert("android", "plain");

  expect(getComputedStyle(title).paddingInlineEnd).toBe(DISMISS_RESERVE);
  expect(getComputedStyle(description).paddingInlineEnd).toBe(DISMISS_RESERVE);
});

test("gives an Android alert without a dismiss button the full width", async () => {
  const { title, description } = await showAlert("android", "warning", false);

  expect(getComputedStyle(title).paddingInlineEnd).toBe("0px");
  expect(getComputedStyle(description).paddingInlineEnd).toBe("0px");
});

for (const platform of ["linux", "ios", "windows"] as const) {
  test(`reserves no dismiss room beside the text on ${platform}`, async () => {
    const { title, description } = await showAlert(platform, "plain");

    expect(getComputedStyle(title).paddingInlineEnd).toBe("0px");
    expect(getComputedStyle(description).paddingInlineEnd).toBe("0px");
  });
}
