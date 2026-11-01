import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";
import ConfirmDialogHarness from "./ConfirmDialogHarness.svelte";

const PHONE = { width: 390, height: 844 } as const;
const TABLET = { width: 820, height: 1180 } as const;

type Screen = { readonly width: number; readonly height: number };

async function openOn(
  platform: Platform,
  screen: Screen,
  props: { iosPhoneLook?: "actionSheet" } = {},
) {
  await page.viewport(screen.width, screen.height);
  document.documentElement.dataset.platform = platform;
  document.documentElement.dataset.theme = "light";
  const rendered = await render(ConfirmDialogHarness, props);
  const dialog = page.getByRole("alertdialog", { name: "Delete downloads?" });
  await expect.element(dialog).toBeVisible();
  return { dialog: dialog.element() as HTMLElement, rendered };
}

function buttonOf(name: string): HTMLElement {
  return page.getByRole("button", { name }).element() as HTMLElement;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test("draws iOS's action sheet 300 wide on 34 rounded glass, 14 in, 16 above the bottom edge", async () => {
  const { dialog } = await openOn("ios", PHONE, {
    iosPhoneLook: "actionSheet",
  });
  const style = getComputedStyle(dialog);
  const box = dialog.getBoundingClientRect();

  expect(box.width).toBeCloseTo(300, 0);
  expect(style.paddingTop).toBe("14px");
  expect(style.paddingLeft).toBe("14px");
  expect(style.borderTopLeftRadius).toBe("34px");
  expect(style.backgroundColor).toBe("rgba(247, 247, 247, 0.8)");
  expect(PHONE.height - box.bottom).toBeCloseTo(16, 0);
  expect(box.left + box.width / 2).toBeCloseTo(PHONE.width / 2, 0);
});

test("sets the question at the start, 8 in, in 17 on 22 semibold", async () => {
  const { dialog } = await openOn("ios", PHONE, {
    iosPhoneLook: "actionSheet",
  });
  const title = page.getByRole("heading", { name: "Delete downloads?" });
  const style = getComputedStyle(title.element());

  expect(style.fontSize).toBe("17px");
  expect(style.lineHeight).toBe("22px");
  expect(style.fontWeight).toBe("600");
  expect(style.textAlign).toBe("start");
  expect(style.paddingLeft).toBe("8px");
  expect(style.paddingTop).toBe("8px");
  expect(title.element().getBoundingClientRect().left).toBeCloseTo(
    dialog.getBoundingClientRect().left + 14,
    0,
  );
});

test("stacks Delete over Cancel as 48 tall, 16 in, grey capsules, Delete in the danger text", async () => {
  await openOn("ios", PHONE, { iosPhoneLook: "actionSheet" });
  const remove = buttonOf("Delete");
  const cancel = buttonOf("Cancel");
  const style = getComputedStyle(remove);

  expect(remove.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(cancel.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(style.paddingLeft).toBe("16px");
  expect(style.backgroundColor).toBe("rgba(118, 118, 128, 0.12)");
  expect(style.fontWeight).toBe("590");
  expect(style.fontSize).toBe("17px");
  expect(Number.parseFloat(style.borderTopLeftRadius)).toBeGreaterThanOrEqual(
    24,
  );
  expect(style.color).toBe(
    resolvedColour("--native-color-on-button-destructive", "color"),
  );
  expect(getComputedStyle(cancel).color).toBe(
    resolvedColour("--foreground", "color"),
  );
});

test("sets the actions 8 apart and Cancel 8 further down, 24 below the message", async () => {
  const { dialog } = await openOn("ios", PHONE, {
    iosPhoneLook: "actionSheet",
  });
  const message = dialog.querySelector("p");
  if (message === null) {
    throw new Error("the sheet drew no message");
  }
  const remove = buttonOf("Delete").getBoundingClientRect();
  const cancel = buttonOf("Cancel").getBoundingClientRect();

  expect(remove.top).toBeLessThan(cancel.top);
  expect(cancel.top - remove.bottom).toBeCloseTo(16, 0);
  expect(remove.top - message.getBoundingClientRect().bottom).toBeCloseTo(
    24,
    0,
  );
});

test.each<Platform>(["android", "linux", "macos", "windows"])(
  "keeps %s's look when asked for an action sheet",
  async (platform) => {
    const asked = await openOn(platform, PHONE, {
      iosPhoneLook: "actionSheet",
    });
    const askedClasses = asked.dialog.className;
    const askedOrder = [...asked.dialog.querySelectorAll("button")].map(
      (button) => button.textContent.trim(),
    );
    await asked.rendered.unmount();

    const plain = await openOn(platform, PHONE);

    expect(plain.dialog.className).toBe(askedClasses);
    expect(
      [...plain.dialog.querySelectorAll("button")].map((button) =>
        button.textContent.trim(),
      ),
    ).toEqual(askedOrder);
  },
);

test("keeps today's dialog on an iPad when asked for an action sheet", async () => {
  const { dialog } = await openOn("ios", TABLET, {
    iosPhoneLook: "actionSheet",
  });
  const remove = buttonOf("Delete").getBoundingClientRect();
  const cancel = buttonOf("Cancel").getBoundingClientRect();

  expect(getComputedStyle(dialog).borderTopLeftRadius).toBe("10px");
  expect(cancel.left).toBeLessThan(remove.left);
  expect(cancel.top).toBeCloseTo(remove.top, 0);
});
