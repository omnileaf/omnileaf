import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";
import ChangeHomeButton from "./ChangeHomeButton.svelte";

interface ChangeLook {
  readonly platform: Platform;
  readonly label: string;
  readonly corner: string;
  readonly height: number;
  readonly shadow: string;
  readonly fill: string;
  readonly edge: string;
  readonly bottomEdge: string;
}

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;
const SHADOW_XS = "rgba(0, 0, 0, 0.05) 0px 1px 2px 0px";

const LOOKS: readonly ChangeLook[] = [
  {
    platform: "linux",
    label: "Change",
    corner: "8px",
    height: 38,
    shadow: SHADOW_XS,
    fill: "--background",
    edge: "--input",
    bottomEdge: "--input",
  },
  {
    platform: "macos",
    label: "Change…",
    corner: "6px",
    height: 28,
    shadow: SHADOW_XS,
    fill: "--background",
    edge: "--input",
    bottomEdge: "--input",
  },
  {
    platform: "windows",
    label: "Change",
    corner: "4px",
    height: 32,
    shadow: "none",
    fill: "--windows-control",
    edge: "--windows-stroke",
    bottomEdge: "--windows-stroke-strong",
  },
];

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const look of LOOKS) {
  test(`draws Change on ${look.platform} as that platform's outlined button`, async () => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
    document.documentElement.dataset.platform = look.platform;
    document.documentElement.dataset.theme = "light";
    await render(ChangeHomeButton, {
      platform: look.platform,
      isBusy: false,
      onclick: () => {},
    });

    const change = page.getByRole("button", { name: look.label }).element();
    const style = getComputedStyle(change);

    expect(change.getBoundingClientRect().height).toBeCloseTo(look.height, 0);
    expect(style.borderTopLeftRadius).toBe(look.corner);
    expect(style.fontWeight).toBe("500");
    expect(style.boxShadow).toContain(look.shadow);
    expect(style.backgroundColor).toBe(
      resolvedColour(look.fill, "backgroundColor"),
    );
    expect(style.borderTopColor).toBe(resolvedColour(look.edge, "color"));
    expect(style.borderBottomColor).toBe(
      resolvedColour(look.bottomEdge, "color"),
    );
  });
}

test("chooses another folder when Change is pressed", async () => {
  let presses = 0;
  await render(ChangeHomeButton, {
    platform: "linux",
    isBusy: false,
    onclick: () => {
      presses += 1;
    },
  });

  await page.getByRole("button", { name: "Change" }).click();

  expect(presses).toBe(1);
});

test("ends Change in an ellipsis on macOS, since it opens another window", async () => {
  await render(ChangeHomeButton, {
    platform: "macos",
    isBusy: false,
    onclick: () => {},
  });

  const change = page.getByRole("button", { name: "Change…" });

  await expect.element(change).toBeInTheDocument();
});

test("holds Change back while the home folder is changing", async () => {
  let presses = 0;
  await render(ChangeHomeButton, {
    platform: "windows",
    isBusy: true,
    onclick: () => {
      presses += 1;
    },
  });
  const change = page.getByRole("button", { name: "Change" });

  await change.click({ force: true });

  await expect.element(change).toHaveAttribute("aria-disabled", "true");
  expect(presses).toBe(0);
});
