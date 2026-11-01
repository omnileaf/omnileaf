import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { compositedContrast } from "../../../../../tests/components/contrast-ratio";
import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import AlertHarness from "./AlertHarness.svelte";
import type { AlertTone } from "./tones.ts";

const FILLS = {
  plain: "--native-color-info-bar",
  warning: "--native-color-info-bar-warning",
} as const satisfies Record<AlertTone, string>;
const ICON_INKS = {
  plain: "--native-color-info-bar-icon",
  warning: "--native-color-info-bar-warning-icon",
} as const satisfies Record<AlertTone, string>;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function showAlert(tone: AlertTone, theme: "light" | "dark" = "light") {
  document.documentElement.dataset.theme = theme;
  followCorePlatform("windows");
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
    action: page.getByRole("button", { name: "Remove its books" }).element(),
    dismiss: page.getByRole("button", { name: "Dismiss" }).element(),
  };
}

for (const tone of ["plain", "warning"] as const) {
  test(`fills a ${tone} alert as an InfoBar's severity fill, 4px round, 48px at least`, async () => {
    const { alert } = await showAlert(tone);

    const style = getComputedStyle(alert);

    expect(style.backgroundColor).toBe(
      resolvedColour(FILLS[tone], "backgroundColor"),
    );
    expect(style.borderTopLeftRadius).toBe("4px");
    expect(style.borderTopColor).toBe(
      resolvedColour("--native-color-info-bar-edge", "color"),
    );
    expect(alert.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
  });

  test(`inks a ${tone} alert's 16px icon in its severity`, async () => {
    const { icon } = await showAlert(tone);

    const box = icon?.getBoundingClientRect();

    expect([box?.width, box?.height]).toEqual([16, 16]);
    expect(getComputedStyle(icon ?? document.body).color).toBe(
      resolvedColour(ICON_INKS[tone], "color"),
    );
  });
}

test("sets the title semibold and the description regular in the InfoBar's ink", async () => {
  const { title, description } = await showAlert("warning");

  expect(getComputedStyle(title).fontWeight).toBe("600");
  expect(getComputedStyle(description).fontWeight).toBe("400");
  expect(getComputedStyle(description).color).toBe(
    resolvedColour("--native-color-on-info-bar", "color"),
  );
});

test("draws the action as a standard 32px button and the close as a 38px square at the corner", async () => {
  const { alert, action, dismiss } = await showAlert("warning");

  const box = alert.getBoundingClientRect();
  const close = dismiss.getBoundingClientRect();

  expect(getComputedStyle(action).height).toBe("32px");
  expect(getComputedStyle(action).backgroundColor).toBe(
    resolvedColour("--native-color-button-secondary", "backgroundColor"),
  );
  expect([close.width, close.height]).toEqual([38, 38]);
  expect(box.right - close.right).toBe(6);
  expect(close.top - box.top).toBe(6);
});

for (const theme of ["light", "dark"] as const) {
  for (const tone of ["plain", "warning"] as const) {
    test(`reads a ${tone} alert's title and description at 4.5 to 1 in the ${theme} theme`, async () => {
      const { alert, title, description } = await showAlert(tone, theme);

      const ground = resolvedColour("--background", "backgroundColor");
      const fill = getComputedStyle(alert).backgroundColor;

      for (const text of [title, description]) {
        expect(compositedContrast(text, [ground, fill])).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });
  }
}
