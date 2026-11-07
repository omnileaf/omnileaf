import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import ReaderTopBarHarness from "./ReaderTopBarHarness.svelte";

const PHONE = { width: 400, height: 800 };
const CHEVRON_PX = 16;
const SERIES = "Sample Series";

async function openBar(platform: Platform): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await page.viewport(PHONE.width, PHONE.height);
  await render(ReaderTopBarHarness, { platform });
}

function jumpTrigger(): HTMLElement {
  const element = page
    .getByRole("button", { name: /Jump to a book/ })
    .element();
  if (!(element instanceof HTMLElement)) {
    throw new Error("the top bar drew no jump trigger");
  }
  return element;
}

function textOf(text: string): HTMLElement {
  const element = [...jumpTrigger().querySelectorAll("span")].find(
    (span) => span.textContent.trim() === text,
  );
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the jump trigger drew no ${text}`);
  }
  return element;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("sets Android's series title at 22 over 28 in a regular weight inside the jump trigger", async () => {
  await openBar("android");
  const style = getComputedStyle(textOf(SERIES));

  expect(style.fontSize).toBe("22px");
  expect(style.lineHeight).toBe("28px");
  expect(style.fontWeight).toBe("400");
});

test("sets Android's book line at 12 over 16 with the book name in the strong ink and a 16 chevron after it", async () => {
  await openBar("android");
  const book = getComputedStyle(textOf("Volume 2"));
  const pageText = getComputedStyle(textOf("· Page 4 of 64"));
  const chevron = jumpTrigger().querySelector("[data-icon='chevron-down']");

  expect(book.fontSize).toBe("12px");
  expect(book.lineHeight).toBe("16px");
  expect(book.fontWeight).toBe("500");
  expect(book.letterSpacing).toBe("0.5px");
  expect(book.color).not.toBe(pageText.color);
  expect(chevron?.getBoundingClientRect().width).toBe(CHEVRON_PX);
  expect(chevron?.getBoundingClientRect().height).toBe(CHEVRON_PX);
});

test("makes the whole Android title block the jump button", async () => {
  await openBar("android");
  const trigger = jumpTrigger().getBoundingClientRect();

  expect(trigger.height).toBeGreaterThanOrEqual(
    textOf(SERIES).getBoundingClientRect().height +
      textOf("Volume 2").getBoundingClientRect().height,
  );
  expect(jumpTrigger().contains(textOf(SERIES))).toBe(true);
});

test("keeps the iPhone's 14 semibold series title", async () => {
  await openBar("ios");
  const style = getComputedStyle(textOf(SERIES));

  expect(style.fontSize).toBe("14px");
  expect(style.fontWeight).toBe("600");
});
