import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { FilterCondition } from "#lib/library/library-listing.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import SearchField from "./SearchField.svelte";

test("clears the typed text and keeps the field focused", async () => {
  const typed: string[] = [];
  const screen = await render(SearchField, {
    text: "market",
    conditions: [],
    hasTokens: false,
    onType: (text: string) => {
      typed.push(text);
    },
    onRemove: () => undefined,
    onEscape: () => undefined,
    listId: "results",
    activeId: undefined,
    hasChoices: false,
    onKey: () => false,
  });

  await screen.getByRole("button", { name: "Clear" }).click();

  expect(typed).toEqual([""]);
  await expect.element(screen.getByRole("combobox")).toHaveFocus();
});

test("leaves typed titles as typed, without the keyboard's corrections", async () => {
  const screen = await render(SearchField, {
    text: "",
    conditions: [],
    hasTokens: false,
    onType: () => undefined,
    onRemove: () => undefined,
    onEscape: () => undefined,
    listId: "results",
    activeId: undefined,
    hasChoices: false,
    onKey: () => false,
  });

  const field = screen.getByRole("combobox");

  await expect.element(field).toHaveAttribute("autocorrect", "off");
  await expect.element(field).toHaveAttribute("autocapitalize", "none");
  await expect.element(field).toHaveAttribute("spellcheck", "false");
});

const IPHONE = { width: 402, height: 874 };

async function renderTokenField(
  hasTokens: boolean,
  { text, conditions }: { text: string; conditions: FilterCondition[] },
) {
  const onType = vi.fn();
  const onRemove = vi.fn();
  followCorePlatform(hasTokens ? "ios" : "android");
  const screen = await render(SearchField, {
    text,
    conditions,
    hasTokens,
    onType,
    onRemove,
    onEscape: () => undefined,
    listId: "results",
    activeId: undefined,
    hasChoices: false,
    onKey: () => false,
  });
  return { screen, onType, onRemove };
}

describe("with a typed filter", () => {
  beforeEach(async () => {
    document.documentElement.dataset.theme = "light";
    await page.viewport(IPHONE.width, IPHONE.height);
  });

  afterEach(() => {
    delete document.documentElement.dataset.platform;
    delete document.documentElement.dataset.theme;
    document.body.replaceChildren();
  });

  test("shows the filter as a token inside the field and names it to the field on an iPhone", async () => {
    const { screen } = await renderTokenField(true, {
      text: "harbour",
      conditions: ["unread"],
    });
    const field = screen.getByRole("combobox");
    const token = screen.getByText("Unread", { exact: true });

    await expect.element(field).toHaveAccessibleDescription("Filters Unread");
    await expect
      .element(screen.getByRole("button", { name: "Remove the Unread filter" }))
      .not.toBeInTheDocument();
    const box = token.element().getBoundingClientRect();
    const fieldBox = field.element().getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(fieldBox.left);
    const style = getComputedStyle(token.element());
    expect({
      height: box.height,
      paddingInline: [style.paddingLeft, style.paddingRight],
      isCapsule: Number.parseFloat(style.borderTopLeftRadius) >= box.height / 2,
      fill: style.backgroundColor,
      ink: style.color,
      size: style.fontSize,
      lineHeight: style.lineHeight,
      weight: style.fontWeight,
      tracking: style.letterSpacing,
      shrinks: style.flexShrink,
    }).toEqual({
      height: 26,
      paddingInline: ["9px", "9px"],
      isCapsule: true,
      fill: resolvedColour("#2f6f4f", "backgroundColor"),
      ink: resolvedColour("#ffffff", "color"),
      size: "15px",
      lineHeight: "20px",
      weight: "590",
      tracking: "-0.23px",
      shrinks: "0",
    });
  });

  test("removes the last token with backspace at the start of the field on an iPhone", async () => {
    const { screen, onRemove } = await renderTokenField(true, {
      text: "harbour",
      conditions: ["unread", "started"],
    });
    const field = screen.getByRole("combobox");
    await field.click();
    (field.element() as HTMLInputElement).setSelectionRange(0, 0);

    await userEvent.keyboard("{Backspace}");

    expect(onRemove.mock.calls).toEqual([["started"]]);
  });

  test("clears the text and every token with Clear on an iPhone, shown for tokens alone", async () => {
    const { screen, onType, onRemove } = await renderTokenField(true, {
      text: "",
      conditions: ["unread", "started"],
    });

    await screen.getByRole("button", { name: "Clear" }).click();

    expect(onType.mock.calls).toEqual([[""]]);
    expect(onRemove.mock.calls).toEqual([["unread"], ["started"]]);
  });

  test("keeps the filter out of the field, and backspace and Clear to the text, on an Android phone", async () => {
    const { screen, onType, onRemove } = await renderTokenField(false, {
      text: "harbour",
      conditions: ["unread"],
    });
    const field = screen.getByRole("combobox");
    await field.click();
    (field.element() as HTMLInputElement).setSelectionRange(0, 0);

    await userEvent.keyboard("{Backspace}");
    await screen.getByRole("button", { name: "Clear" }).click();

    await expect.element(field).not.toHaveAttribute("aria-describedby");
    await expect
      .element(screen.getByText("Unread", { exact: true }))
      .not.toBeVisible();
    expect(onRemove).not.toHaveBeenCalled();
    expect(onType.mock.calls).toEqual([[""]]);
  });
});
