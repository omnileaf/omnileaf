import { afterEach, expect, test } from "vitest";
import { cdp, page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import Checkbox from "./checkbox.svelte";

interface CheckboxLook {
  readonly platform: Platform;
  readonly size: number;
  readonly corner: string;
  readonly edgeWidth: string;
  readonly edge: string;
}

const LOOKS: readonly CheckboxLook[] = [
  {
    platform: "linux",
    size: 16,
    corner: "4px",
    edgeWidth: "1px",
    edge: "--input",
  },
  {
    platform: "android",
    size: 18,
    corner: "2px",
    edgeWidth: "2px",
    edge: "--android-outline",
  },
  {
    platform: "ios",
    size: 22,
    corner: "9999px",
    edgeWidth: "1px",
    edge: "--input",
  },
  {
    platform: "macos",
    size: 16,
    corner: "5px",
    edgeWidth: "0px",
    edge: "--input",
  },
  {
    platform: "windows",
    size: 20,
    corner: "4px",
    edgeWidth: "1px",
    edge: "--input",
  },
];

function fillOf(element: Element): string {
  return getComputedStyle(element).backgroundColor;
}

function resolvedShadow(value: string): string {
  const probe = document.createElement("span");
  probe.style.boxShadow = value;
  document.body.append(probe);
  const shadow = getComputedStyle(probe).boxShadow;
  probe.remove();
  return shadow;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.contrast;
});

test("fills a box only some of whose items are picked as a ticked one, with a dash", async () => {
  await render(Checkbox, { checked: true, "aria-label": "Ticked" });
  await render(Checkbox, { indeterminate: true, "aria-label": "Some" });
  const ticked = page.getByRole("checkbox", { name: "Ticked" });
  const some = page.getByRole("checkbox", { name: "Some" });

  await expect.element(some).toHaveAttribute("aria-checked", "mixed");

  expect(fillOf(some.element())).toBe(fillOf(ticked.element()));
  expect(some.element().querySelector("svg")).not.toBeNull();
});

for (const look of LOOKS) {
  test(`draws the ${look.platform} checkbox at its own size, corner and edge`, async () => {
    document.documentElement.dataset.platform = look.platform;
    document.documentElement.dataset.theme = "light";
    await render(Checkbox, { "aria-label": "Unticked" });

    const box = page.getByRole("checkbox", { name: "Unticked" }).element();
    const style = getComputedStyle(box);

    expect(box.getBoundingClientRect().width).toBeCloseTo(look.size, 0);
    expect(style.borderTopLeftRadius).toBe(look.corner);
    expect(style.borderTopWidth).toBe(look.edgeWidth);
    expect(style.borderTopColor).toBe(resolvedColour(look.edge, "color"));
  });
}

test("leaves an unticked box clear in the light theme and lightly filled in the dark one", async () => {
  document.documentElement.dataset.platform = "linux";
  document.documentElement.dataset.theme = "light";
  await render(Checkbox, { "aria-label": "Unticked" });
  const box = page.getByRole("checkbox", { name: "Unticked" }).element();
  const lightFill = fillOf(box);

  document.documentElement.dataset.theme = "dark";

  expect(lightFill).toBe("rgba(0, 0, 0, 0)");
  expect(fillOf(box)).not.toBe("rgba(0, 0, 0, 0)");
});

async function press(element: Element): Promise<void> {
  const { left, top, width, height } = element.getBoundingClientRect();
  const frame = window.frameElement?.getBoundingClientRect();
  await cdp().send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    x: (frame?.left ?? 0) + left + width / 2,
    y: (frame?.top ?? 0) + top + height / 2,
  });
}

async function release(): Promise<void> {
  await cdp().send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    x: 0,
    y: 0,
  });
}

test("draws the macOS dash at the glyph size of the tick", async () => {
  document.documentElement.dataset.platform = "macos";
  await render(Checkbox, { indeterminate: true, "aria-label": "Some" });
  await render(Checkbox, { checked: true, "aria-label": "Ticked" });

  const dash = page.getByRole("checkbox", { name: "Some" }).element();
  const tick = page.getByRole("checkbox", { name: "Ticked" }).element();

  expect(dash.querySelector("svg")?.getBoundingClientRect().width).toBe(
    tick.querySelector("svg")?.getBoundingClientRect().width,
  );
});

test("keeps a pressed macOS dash box in the accent under the pressed tint", async () => {
  document.documentElement.dataset.platform = "macos";
  document.documentElement.dataset.theme = "light";
  await render(Checkbox, { indeterminate: true, "aria-label": "Some" });
  await render(Checkbox, { checked: true, "aria-label": "Ticked" });
  const dash = page.getByRole("checkbox", { name: "Some" }).element();
  const tick = page.getByRole("checkbox", { name: "Ticked" }).element();

  await press(dash);
  const pressedDash = getComputedStyle(dash);
  const dashLook = [pressedDash.backgroundColor, pressedDash.boxShadow];
  await release();
  await press(tick);
  const pressedTick = getComputedStyle(tick);
  const tickLook = [pressedTick.backgroundColor, pressedTick.boxShadow];
  await release();

  expect(dashLook).toEqual(tickLook);
});

for (const [name, theme, contrast] of [
  ["light", "light", undefined],
  ["dark", "dark", undefined],
  ["Increase contrast", "light", "more"],
  ["dark with Increase contrast", "dark", "more"],
] as const) {
  test(`plates the macOS box with the radio field and rim in the ${name} look`, async () => {
    document.documentElement.dataset.platform = "macos";
    document.documentElement.dataset.theme = theme;
    if (contrast !== undefined) {
      document.documentElement.dataset.contrast = contrast;
    }
    await render(Checkbox, { "aria-label": "Unticked" });

    const box = page.getByRole("checkbox", { name: "Unticked" }).element();

    expect(fillOf(box)).toBe(
      resolvedColour("--native-color-radio-field", "backgroundColor"),
    );
    expect(getComputedStyle(box).boxShadow).toContain(
      resolvedShadow("var(--native-shadow-radio-rim)"),
    );
  });
}

for (const platform of ["windows", "linux"] as const) {
  test(`keeps the raised shadow on the ${platform} box`, async () => {
    document.documentElement.dataset.platform = platform;
    await render(Checkbox, { "aria-label": "Unticked" });

    const box = page.getByRole("checkbox", { name: "Unticked" }).element();

    expect(getComputedStyle(box).boxShadow).toContain(
      resolvedShadow("var(--shadow-raised)"),
    );
  });
}

test("leaves the raised shadow off the macOS box", async () => {
  document.documentElement.dataset.platform = "macos";
  await render(Checkbox, { "aria-label": "Unticked" });

  const box = page.getByRole("checkbox", { name: "Unticked" }).element();

  expect(getComputedStyle(box).boxShadow).not.toContain(
    resolvedShadow("var(--shadow-raised)"),
  );
});
