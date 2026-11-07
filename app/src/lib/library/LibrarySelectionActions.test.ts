import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import LibrarySelectionActions from "./LibrarySelectionActions.svelte";
import type { LabelsFrom } from "./series-selection";

const PHONE = { width: 390, height: 844 };
const ACTION_ICON_SIZE = 24;
const ACTION_MIN_HEIGHT = 48;
const ACTION_CORNER = "16px";
const ACTION_INLINE_PADDING = "12px";
const LABEL_SIZE = "12px";
const LABEL_TRACKING = "0.5px";
const DISABLED_OPACITY = "0.6";

async function drawBar(count = 0): Promise<{ picked: string[] }> {
  const calls = { picked: [] as string[] };
  await page.viewport(PHONE.width, PHONE.height);
  await render(LibrarySelectionActions, {
    count,
    isPill: false,
    keepsLabels: true,
    onLabels: (from: LabelsFrom) => {
      calls.picked.push(from);
    },
    onMarkRead: () => {
      calls.picked.push("read");
    },
    onDelete: () => {
      calls.picked.push("delete");
    },
    onCancel: () => undefined,
  });
  return calls;
}

function buttonOf(name: string): Element {
  return page.getByRole("button", { name }).element();
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws each action as a column of a 24px Material icon over a 12px label on an Android phone", async () => {
  followCorePlatform("android");
  await drawBar();

  for (const name of ["Categories", "Tags", "Mark as read"]) {
    const button = buttonOf(name);
    const style = getComputedStyle(button);
    const icon = button.querySelector("[data-icon]");

    expect(icon?.getBoundingClientRect().width).toBe(ACTION_ICON_SIZE);
    expect(button.querySelector("svg")).toBeNull();
    expect(style.flexDirection).toBe("column");
    expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      ACTION_MIN_HEIGHT,
    );
    expect(style.borderTopLeftRadius).toBe(ACTION_CORNER);
    expect(style.paddingLeft).toBe(ACTION_INLINE_PADDING);
    expect(style.fontSize).toBe(LABEL_SIZE);
    expect(style.letterSpacing).toBe(LABEL_TRACKING);
  }
});

test("disables every action and dims it when no series are chosen on an Android phone", async () => {
  followCorePlatform("android");
  await drawBar(0);

  for (const name of ["Categories", "Tags", "Mark as read", "Delete"]) {
    const button = page.getByRole("button", { name });

    await expect.element(button).toBeDisabled();
    expect(getComputedStyle(button.element()).opacity).toBe(DISABLED_OPACITY);
  }
});

test("enables every action when series are chosen on an Android phone", async () => {
  followCorePlatform("android");
  await drawBar(1);

  for (const name of ["Categories", "Tags", "Mark as read", "Delete"]) {
    const button = page.getByRole("button", { name });

    await expect.element(button).toBeEnabled();
    expect(getComputedStyle(button.element()).opacity).toBe("1");
  }
});

test("runs an action when series are chosen on an Android phone", async () => {
  followCorePlatform("android");
  const calls = await drawBar(2);

  await page.getByRole("button", { name: "Mark as read" }).click();

  expect(calls.picked).toEqual(["read"]);
});

test("keeps the Lucide icons in the floating card on an iPhone", async () => {
  followCorePlatform("ios");
  await drawBar(2);

  expect(buttonOf("Categories").querySelector("svg")).not.toBeNull();
});
