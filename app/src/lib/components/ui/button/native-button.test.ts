import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import Button from "./button.svelte";

interface NativeButtonLook {
  readonly platform: Platform;
  readonly height: number;
  readonly target: string;
  readonly fill: string;
  readonly darkFill: string;
  readonly secondaryFill: string;
}

const NATIVE_LOOKS: readonly NativeButtonLook[] = [
  {
    platform: "ios",
    height: 34,
    target: "44px",
    fill: "rgb(47, 111, 79)",
    darkFill: "rgb(127, 203, 157)",
    secondaryFill: "rgba(118, 118, 128, 0.12)",
  },
  {
    platform: "android",
    height: 40,
    target: "48px",
    fill: "rgb(50, 106, 77)",
    darkFill: "rgb(164, 209, 180)",
    secondaryFill: "rgb(208, 232, 215)",
  },
];

const PLATFORMS: readonly Platform[] = [
  "android",
  "ios",
  "linux",
  "macos",
  "windows",
];

const CAPSULE = "999px";

const label = createRawSnippet(() => ({ render: () => "<span>Remove</span>" }));

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

for (const platform of PLATFORMS) {
  test(`says it's busy and ignores a second press while it works on ${platform}`, async () => {
    followCorePlatform(platform);
    let presses = 0;
    let finish = (): void => undefined;
    await render(Button, {
      look: "dialog-primary",
      type: "button",
      children: label,
      onClickPromise: () => {
        presses += 1;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    });
    const button = page.getByRole("button", { name: "Remove" });

    await button.click();
    await button.click({ force: true });

    await expect.element(button).toHaveAttribute("aria-busy", "true");
    expect(presses).toBe(1);
    finish();
  });
}

for (const look of NATIVE_LOOKS) {
  test(`draws a dialog's main button as ${look.platform}'s own button`, async () => {
    followCorePlatform(look.platform);
    document.documentElement.dataset.theme = "light";
    await render(Button, {
      look: "dialog-primary",
      type: "button",
      children: label,
    });

    const button = page.getByRole("button", { name: "Remove" }).element();
    const style = getComputedStyle(button);

    expect(button.getBoundingClientRect().height).toBeCloseTo(look.height, 0);
    expect(style.borderTopLeftRadius).toBe(CAPSULE);
    expect(style.backgroundColor).toBe(look.fill);
  });

  test(`gives ${look.platform}'s button its full touch target`, async () => {
    followCorePlatform(look.platform);
    await render(Button, {
      look: "dialog-primary",
      type: "button",
      children: label,
    });

    const button = page.getByRole("button", { name: "Remove" }).element();
    const target = getComputedStyle(button, "::before").height;

    expect(target).toBe(look.target);
  });

  test(`draws ${look.platform}'s button in its dark colours inside a dark part of the page`, async () => {
    followCorePlatform(look.platform);
    document.documentElement.dataset.theme = "light";
    const darkPart = document.createElement("main");
    darkPart.dataset.theme = "dark";
    document.body.append(darkPart);
    await render(Button, {
      target: darkPart,
      props: { look: "dialog-primary", type: "button", children: label },
    });

    const button = page.getByRole("button", { name: "Remove" }).element();

    expect(getComputedStyle(button).backgroundColor).toBe(look.darkFill);
    darkPart.remove();
  });
}

for (const look of NATIVE_LOOKS) {
  test(`draws a dialog's other button as ${look.platform}'s secondary button`, async () => {
    followCorePlatform(look.platform);
    document.documentElement.dataset.theme = "light";
    await render(Button, {
      look: "dialog-secondary",
      type: "button",
      children: label,
    });

    const button = page.getByRole("button", { name: "Remove" }).element();
    const style = getComputedStyle(button);

    expect(button.getBoundingClientRect().height).toBeCloseTo(look.height, 0);
    expect(style.borderTopLeftRadius).toBe(CAPSULE);
    expect(style.backgroundColor).toBe(look.secondaryFill);
  });
}
