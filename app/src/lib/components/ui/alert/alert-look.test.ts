import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import type { Platform } from "#lib/ipc/bindings.ts";

import AlertHarness from "./AlertHarness.svelte";
import type { AlertTone } from "./tones.ts";

const ICON_SIZE = 16;

async function showAlert(platform: Platform, tone: AlertTone) {
  document.documentElement.dataset.platform = platform;
  document.documentElement.dataset.theme = "light";
  await render(AlertHarness, { tone, onDismiss: () => undefined });
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

for (const tone of ["plain", "warning"] as const) {
  test(`lays a ${tone} alert on Android's tonal container without an edge`, async () => {
    const { alert } = await showAlert("android", tone);

    const style = getComputedStyle(alert);

    expect(style.backgroundColor).toBe(
      resolvedColour("--android-container", "backgroundColor"),
    );
    expect(style.borderTopColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.borderTopLeftRadius).toBe("12px");
  });
}
