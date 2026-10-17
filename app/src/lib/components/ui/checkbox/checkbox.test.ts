import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
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
    corner: "4px",
    edgeWidth: "1px",
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

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
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
