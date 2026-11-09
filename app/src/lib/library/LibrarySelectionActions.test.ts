import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import LibrarySelectionActions from "./LibrarySelectionActions.svelte";
import type { LabelsFrom } from "./series-selection";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 1024, height: 800 };
const ACTION_ICON_SIZE = 24;
const ACTION_MIN_HEIGHT = 48;
const ACTION_CORNER = "16px";
const ACTION_INLINE_PADDING = "12px";
const LABEL_SIZE = "12px";
const LABEL_TRACKING = "0.5px";
const DISABLED_OPACITY = "0.6";

function mainLandmark(): HTMLElement {
  const main = document.createElement("main");
  document.body.append(main);
  return main;
}

async function drawBar(
  count = 0,
  size: { width: number; height: number } = PHONE,
): Promise<{ picked: string[] }> {
  const calls = { picked: [] as string[] };
  await page.viewport(size.width, size.height);
  await render(LibrarySelectionActions, {
    target: mainLandmark(),
    props: {
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
    },
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

  for (const name of ["Categories", "Tags", "Mark as read", "More"]) {
    const button = page.getByRole("button", { name });

    await expect.element(button).toBeDisabled();
    expect(getComputedStyle(button.element()).opacity).toBe(DISABLED_OPACITY);
  }
});

test("enables every action when series are chosen on an Android phone", async () => {
  followCorePlatform("android");
  await drawBar(1);

  for (const name of ["Categories", "Tags", "Mark as read", "More"]) {
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

test("keeps Delete out of the bar and behind a More button with a Material three dots icon on an Android phone", async () => {
  followCorePlatform("android");
  await drawBar(2);

  await expect
    .element(page.getByRole("button", { name: "Delete" }))
    .not.toBeInTheDocument();
  const more = buttonOf("More");
  expect(more.querySelector("[data-icon='ellipsis']")).not.toBeNull();
  expect(more.querySelector("svg")).toBeNull();
  expect(more.getAttribute("aria-haspopup")).toBe("menu");
});

test("shows Delete as the More menu's only item and runs it once on an Android phone", async () => {
  followCorePlatform("android");
  const calls = await drawBar(2);

  await page.getByRole("button", { name: "More" }).click();
  await expect
    .element(page.getByRole("menuitem", { name: "Delete" }))
    .toBeVisible();
  expect(page.getByRole("menuitem").elements()).toHaveLength(1);
  await page.getByRole("menuitem", { name: "Delete" }).click();

  expect(calls.picked).toEqual(["delete"]);
});

test("sets the More menu at least 208 wide like the library menu on an Android phone", async () => {
  followCorePlatform("android");
  await drawBar(2);

  await page.getByRole("button", { name: "More" }).click();
  await expect
    .element(page.getByRole("menuitem", { name: "Delete" }))
    .toBeVisible();

  expect(
    page.getByRole("menu").element().getBoundingClientRect().width,
  ).toBeGreaterThanOrEqual(208);
});

test("spreads the three actions and More evenly across the bar on an Android phone", async () => {
  followCorePlatform("android");
  await drawBar(2);

  const row = buttonOf("More").closest("ul");

  expect(row === null ? "" : getComputedStyle(row).justifyContent).toBe(
    "space-evenly",
  );
});

test("opens the More menu from the keyboard and returns focus to More when it closes on an Android phone", async () => {
  followCorePlatform("android");
  await drawBar(2);
  const more = buttonOf("More");

  if (!(more instanceof HTMLElement)) {
    throw new Error("More is not an element");
  }
  more.focus();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(page.getByRole("menuitem", { name: "Delete" }))
    .toHaveFocus();
  await userEvent.keyboard("{Escape}");

  await expect
    .element(page.getByRole("button", { name: "More" }))
    .toHaveFocus();
});

test("keeps Delete in the floating card on an iPhone and an Android tablet", async () => {
  for (const [platform, size] of [
    ["ios", PHONE],
    ["android", TABLET],
  ] as const) {
    document.body.replaceChildren();
    followCorePlatform(platform);
    await drawBar(2, size);

    await expect
      .element(page.getByRole("button", { name: "Delete" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "More" }))
      .not.toBeInTheDocument();
  }
});
