import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import NativeSelectHarness from "./NativeSelectHarness.svelte";

interface SelectLook {
  readonly platform: Platform;
  readonly corner: string;
  readonly edge: string;
  readonly fill: string;
}

const LOOKS: readonly SelectLook[] = [
  { platform: "linux", corner: "8px", edge: "--input", fill: "transparent" },
  {
    platform: "android",
    corner: "4px",
    edge: "--android-outline",
    fill: "transparent",
  },
  { platform: "ios", corner: "10px", edge: "transparent", fill: "--ios-fill" },
  { platform: "macos", corner: "6px", edge: "--input", fill: "transparent" },
  {
    platform: "windows",
    corner: "4px",
    edge: "--windows-stroke",
    fill: "--windows-control",
  },
];

function resolved(
  value: string,
  property: "color" | "backgroundColor",
): string {
  const probe = document.createElement("span");
  probe.style[property] = value.startsWith("--") ? `var(${value})` : value;
  document.body.append(probe);
  const colour = getComputedStyle(probe)[property];
  probe.remove();
  return colour;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const look of LOOKS) {
  test(`draws the ${look.platform} select with its own corners, edge and fill`, async () => {
    document.documentElement.dataset.platform = look.platform;
    document.documentElement.dataset.theme = "light";
    await render(NativeSelectHarness);

    const field = page.getByRole("combobox", { name: "Rescan folders" });
    const style = getComputedStyle(field.element());

    expect(style.borderTopLeftRadius).toBe(look.corner);
    expect(style.borderTopColor).toBe(resolved(look.edge, "color"));
    expect(style.backgroundColor).toBe(resolved(look.fill, "backgroundColor"));
  });
}

test("sets the chosen value at 14px in regular weight", async () => {
  await render(NativeSelectHarness);

  const style = getComputedStyle(
    page.getByRole("combobox", { name: "Rescan folders" }).element(),
  );

  expect(style.fontSize).toBe("14px");
  expect(style.fontWeight).toBe("400");
});
