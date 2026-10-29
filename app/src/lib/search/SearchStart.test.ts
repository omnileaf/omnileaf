import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { followCorePlatform } from "#lib/page/platform.ts";

import { filterWords } from "./condition-labels";
import SearchStart from "./SearchStart.svelte";

const PHONE = { width: 390, height: 800 } as const;
const TABLET = { width: 1024, height: 800 } as const;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function startOn(
  platform: "ios" | "android",
  size: { width: number; height: number },
) {
  await page.viewport(size.width, size.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(SearchStart, {
    recent: [],
    nowMs: 0,
    onRun: () => undefined,
    onClear: () => undefined,
  });
}

function word(text: string): HTMLElement {
  const element = page.getByText(text, { exact: true }).element();
  if (!(element instanceof HTMLElement)) {
    throw new Error(`no typed filter called ${text}`);
  }
  return element;
}

test("draws each typed filter as a 28 point capsule on the control fill on an iPhone", async () => {
  await startOn("ios", PHONE);

  for (const text of Object.values(filterWords())) {
    const chip = word(text);
    const style = getComputedStyle(chip);

    expect({
      isCapsule:
        Number.parseFloat(style.borderTopLeftRadius) >=
        chip.getBoundingClientRect().height / 2,
      height: chip.getBoundingClientRect().height,
      fill: style.backgroundColor,
      isMono: style.fontFamily.includes("mono"),
    }).toEqual({
      isCapsule: true,
      height: 28,
      fill: resolvedColour("--color-native-button-outline", "backgroundColor"),
      isMono: false,
    });
  }
});

test("puts the example sentence above the typed filters on an iPhone", async () => {
  await startOn("ios", PHONE);

  const example = page.getByText(/^For example/).element();

  expect(example.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    word(filterWords().unread).getBoundingClientRect().top,
  );
});

test("keeps the code tags and the sentence below them on an iPad", async () => {
  await startOn("ios", TABLET);

  const example = page.getByText(/^For example/).element();

  expect(example.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    word(filterWords().unread).getBoundingClientRect().bottom,
  );
  expect(getComputedStyle(word(filterWords().unread)).fontFamily).toContain(
    "mono",
  );
});
