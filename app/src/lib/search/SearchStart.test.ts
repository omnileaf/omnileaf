import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { followCorePlatform } from "#lib/page/platform.ts";

import { filterWords } from "./condition-labels";
import type { RecentSearch } from "./recent-searches.svelte";
import SearchStart from "./SearchStart.svelte";

const PHONE = { width: 390, height: 800 } as const;
const TABLET = { width: 1024, height: 800 } as const;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

const RECENT = [
  { text: "harbour gate", atMs: 0 },
  { text: "unread manga", atMs: 0 },
] as const;

async function startOn(
  platform: "ios" | "android",
  size: { width: number; height: number },
  recent: readonly RecentSearch[] = [],
  isGrouped = platform === "ios" && size === PHONE,
) {
  await page.viewport(size.width, size.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  const ground = document.createElement("div");
  if (isGrouped) {
    ground.dataset.ground = "grouped";
  }
  document.body.append(ground);
  await render(SearchStart, {
    target: ground,
    props: {
      recent,
      nowMs: 0,
      isGrouped,
      onRun: () => undefined,
      onClear: () => undefined,
    },
  });
}

function rowsOf(section: string): HTMLElement {
  const list = page
    .getByRole("region", { name: section })
    .getByRole("list")
    .element();
  if (!(list instanceof HTMLElement)) {
    throw new Error(`no rows under ${section}`);
  }
  return list;
}

function plateOf(list: HTMLElement) {
  const style = getComputedStyle(list);
  return { fill: style.backgroundColor, corner: style.borderTopLeftRadius };
}

function rowOf(text: string) {
  const title = page.getByText(text, { exact: true }).element();
  const row = title.closest("li");
  if (row === null) {
    throw new Error(`no row for ${text}`);
  }
  const titleStyle = getComputedStyle(title);
  return {
    height: row.getBoundingClientRect().height,
    titleStart:
      title.getBoundingClientRect().left - row.getBoundingClientRect().left,
    titleSize: titleStyle.fontSize,
    titleWeight: titleStyle.fontWeight,
  };
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

test("sets the section headings in 17 point semibold muted type on an iPhone", async () => {
  await startOn("ios", PHONE);

  const heading = getComputedStyle(
    page.getByRole("heading", { name: "Type a filter to narrow" }).element(),
  );

  expect({ size: heading.fontSize, weight: heading.fontWeight }).toEqual({
    size: "17px",
    weight: "590",
  });
});

test("sets the recent searches and what can be searched as grouped rows on raised plates on an iPhone", async () => {
  await startOn("ios", PHONE, RECENT);

  const plates = [rowsOf("Recent searches"), rowsOf("You can search for")].map(
    plateOf,
  );

  expect(plates).toEqual(
    Array(2).fill({
      fill: resolvedColour("--native-color-group", "backgroundColor"),
      corner: "26px",
    }),
  );
  expect([rowOf("unread manga"), rowOf("Title or series")]).toEqual(
    Array(2).fill({
      height: 52,
      titleStart: 58,
      titleSize: "17px",
      titleWeight: "400",
    }),
  );
});

test("starts the rule between grouped rows level with their titles on an iPhone", async () => {
  await startOn("ios", PHONE, RECENT);

  const second = rowsOf("Recent searches").children.item(1);
  if (second === null) {
    throw new Error("no second recent search");
  }

  expect(getComputedStyle(second, "::after").insetInlineStart).toBe("58px");
});

test("puts Clear in a 34 point plain button beside the recent searches heading on an iPhone", async () => {
  await startOn("ios", PHONE, RECENT);

  const clear = page.getByRole("button", { name: "Clear" }).element();

  expect(clear.getBoundingClientRect().height).toBe(34);
});

test("keeps the recent searches as plain divided rows on an Android phone", async () => {
  await startOn("android", PHONE, RECENT);

  expect(plateOf(rowsOf("Recent searches"))).toEqual({
    fill: "rgba(0, 0, 0, 0)",
    corner: "0px",
  });
  expect(rowOf("unread manga").titleStart).toBe(28);
});

test("keeps the plain divided rows on an iPhone when the page leaves the start ungrouped", async () => {
  await startOn("ios", PHONE, RECENT, false);

  expect(plateOf(rowsOf("Recent searches"))).toEqual({
    fill: "rgba(0, 0, 0, 0)",
    corner: "0px",
  });
  expect(rowOf("unread manga").titleStart).toBe(28);
});
