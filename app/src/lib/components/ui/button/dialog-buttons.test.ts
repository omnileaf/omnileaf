import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";
import Button from "./button.svelte";
import type { ButtonLook } from "./looks.ts";

interface DialogButtonLook {
  readonly platform: Platform;
  readonly corner: string;
  readonly height: number;
  readonly fill: string;
  readonly edge: string;
  readonly bottomEdge: string;
}

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;

const LOOKS: readonly DialogButtonLook[] = [
  {
    platform: "linux",
    corner: "8px",
    height: 36,
    fill: "--background",
    edge: "--input",
    bottomEdge: "--input",
  },
  {
    platform: "android",
    corner: "9999px",
    height: 48,
    fill: "transparent",
    edge: "--android-outline",
    bottomEdge: "--android-outline",
  },
  {
    platform: "ios",
    corner: "8px",
    height: 48,
    fill: "--ios-fill",
    edge: "transparent",
    bottomEdge: "transparent",
  },
  {
    platform: "macos",
    corner: "6px",
    height: 28,
    fill: "--background",
    edge: "--input",
    bottomEdge: "--input",
  },
  {
    platform: "windows",
    corner: "4px",
    height: 32,
    fill: "--windows-control",
    edge: "--windows-stroke",
    bottomEdge: "--windows-stroke-strong",
  },
];

const OUTLINED_LOOKS: readonly ButtonLook[] = [
  "dialog-secondary",
  "confirm-cancel",
];

const label = createRawSnippet(() => ({ render: () => "<span>Cancel</span>" }));

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const look of LOOKS) {
  for (const buttonLook of OUTLINED_LOOKS) {
    test(`draws the ${buttonLook} button in a ${look.platform} dialog as the Parts boards do`, async () => {
      await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
      document.documentElement.dataset.platform = look.platform;
      document.documentElement.dataset.theme = "light";
      await render(Button, {
        look: buttonLook,
        type: "button",
        children: label,
      });

      const button = page.getByRole("button", { name: "Cancel" }).element();
      const style = getComputedStyle(button);

      expect(style.borderTopLeftRadius).toBe(look.corner);
      expect(button.getBoundingClientRect().height).toBeCloseTo(look.height, 0);
      expect(style.fontWeight).toBe("500");
      expect(style.backgroundColor).toBe(
        resolvedColour(look.fill, "backgroundColor"),
      );
      expect(style.borderTopColor).toBe(resolvedColour(look.edge, "color"));
      expect(style.borderBottomColor).toBe(
        resolvedColour(look.bottomEdge, "color"),
      );
    });
  }
}

test("draws the main dialog button on the accent at the dialog button's size", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  document.documentElement.dataset.platform = "macos";
  document.documentElement.dataset.theme = "light";
  await render(Button, {
    look: "dialog-primary",
    type: "button",
    children: label,
  });

  const button = page.getByRole("button", { name: "Cancel" }).element();
  const style = getComputedStyle(button);

  expect(style.borderTopLeftRadius).toBe("6px");
  expect(button.getBoundingClientRect().height).toBeCloseTo(28, 0);
  expect(style.fontWeight).toBe("500");
  expect(style.backgroundColor).toBe(
    resolvedColour("--primary", "backgroundColor"),
  );
});
