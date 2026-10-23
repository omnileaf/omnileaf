import { createRawSnippet, flushSync } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import Button from "./button.svelte";

const LONG_PRESS_MS = 500;

const icon = createRawSnippet(() => ({ render: () => "<span>+</span>" }));

async function renderIconButton(platform: Platform): Promise<HTMLElement> {
  followCorePlatform(platform);
  await render(Button, {
    variant: "plain",
    iconOnly: true,
    label: "Add folder",
    type: "button",
    children: icon,
  });
  const button = page.getByRole("button", { name: "Add folder" }).element();
  if (!(button instanceof HTMLElement)) {
    throw new Error("no button was drawn");
  }
  return button;
}

function holdFor(element: Element, heldMs: number): void {
  vi.useFakeTimers();
  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerType: "touch",
      bubbles: true,
      cancelable: true,
    }),
  );
  vi.advanceTimersByTime(heldMs);
  flushSync();
  vi.useRealTimers();
}

function tooltip() {
  return page.getByText("Add folder", { exact: true });
}

afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test("shows an icon-only button's label as its tooltip on a desktop", async () => {
  await renderIconButton("linux");

  await userEvent.tab();

  await expect.element(tooltip()).toBeVisible();
});

test("shows the label on a long press on Android", async () => {
  const button = await renderIconButton("android");

  holdFor(button, LONG_PRESS_MS);

  await expect.element(tooltip()).toBeVisible();
});

test("shows no tooltip on iOS, which has none", async () => {
  const button = await renderIconButton("ios");

  holdFor(button, LONG_PRESS_MS);

  await expect.element(tooltip()).not.toBeInTheDocument();
});

test("still runs an icon-only button's action on a tap", async () => {
  followCorePlatform("android");
  let presses = 0;
  await render(Button, {
    variant: "plain",
    iconOnly: true,
    label: "Add folder",
    type: "button",
    children: icon,
    onclick: () => {
      presses += 1;
    },
  });

  await page.getByRole("button", { name: "Add folder" }).click();

  expect(presses).toBe(1);
});

test.each<{ platform: Platform; drawn: string }>([
  { platform: "android", drawn: "bg-native-button-primary" },
  { platform: "linux", drawn: "rounded-control" },
])(
  "uses the phone variant on $platform when one is given, and today's look elsewhere",
  async ({ platform, drawn }) => {
    followCorePlatform(platform);
    await render(Button, {
      look: "outline",
      variant: "primary",
      type: "button",
      children: icon,
    });

    const button = page.getByRole("button").element();

    expect(button.getAttribute("class")?.split(" ")).toContain(drawn);
  },
);

test("doesn't run an icon-only button's action after a long press", async () => {
  followCorePlatform("android");
  let presses = 0;
  await render(Button, {
    variant: "plain",
    iconOnly: true,
    label: "Add folder",
    type: "button",
    children: icon,
    onclick: () => {
      presses += 1;
    },
  });
  const button = page.getByRole("button", { name: "Add folder" }).element();

  holdFor(button, LONG_PRESS_MS);
  button.dispatchEvent(
    new PointerEvent("pointerup", { pointerType: "touch", bubbles: true }),
  );
  if (button instanceof HTMLElement) {
    button.click();
  }

  expect(presses).toBe(0);
});

test("shows no tooltip on a disabled icon-only button", async () => {
  followCorePlatform("linux");
  await render(Button, {
    variant: "plain",
    iconOnly: true,
    label: "Add folder",
    type: "button",
    disabled: true,
    children: icon,
  });

  await userEvent.hover(page.getByRole("button", { name: "Add folder" }));

  await expect.element(tooltip()).not.toBeInTheDocument();
});
