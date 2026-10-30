import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { FilterCondition } from "#lib/library/library-listing.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import type { FilterPlace } from "./search-look";
import SearchField from "./SearchField.svelte";

test("clears the typed text and keeps the field focused", async () => {
  const onClear = vi.fn();
  const screen = await render(SearchField, {
    text: "market",
    conditions: [],
    filterPlace: "field",
    onType: () => undefined,
    onRemove: () => undefined,
    onClear,
    onEscape: () => undefined,
    listId: "results",
    activeId: undefined,
    hasChoices: false,
    onKey: () => false,
  });

  await screen.getByRole("button", { name: "Clear" }).click();

  expect(onClear).toHaveBeenCalledOnce();
  await expect.element(screen.getByRole("combobox")).toHaveFocus();
});

test("leaves typed titles as typed, without the keyboard's corrections", async () => {
  const screen = await render(SearchField, {
    text: "",
    conditions: [],
    filterPlace: "field",
    onType: () => undefined,
    onRemove: () => undefined,
    onClear: () => undefined,
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
const NARROW_PHONE = { width: 360, height: 780 };

async function renderPlacedField(
  filterPlace: FilterPlace,
  { text, conditions }: { text: string; conditions: FilterCondition[] },
) {
  const onRemove = vi.fn();
  const onClear = vi.fn();
  followCorePlatform(filterPlace === "token" ? "ios" : "android");
  const screen = await render(SearchField, {
    text,
    conditions,
    filterPlace,
    onType: () => undefined,
    onRemove,
    onClear,
    onEscape: () => undefined,
    listId: "results",
    activeId: undefined,
    hasChoices: false,
    onKey: () => false,
  });
  return { screen, onRemove, onClear };
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

  test("draws the filter as a token inside the field that removes it when pressed", async () => {
    const { screen, onRemove } = await renderPlacedField("token", {
      text: "harbour",
      conditions: ["unread"],
    });
    const field = screen.getByRole("combobox");
    const token = screen.getByRole("button", {
      name: "Remove the Unread filter",
    });

    await expect.element(token).toHaveTextContent("Unread");
    await expect.element(field).not.toHaveAttribute("aria-describedby");
    const box = token.element().getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(
      field.element().getBoundingClientRect().left,
    );
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

    await token.click();

    expect(onRemove.mock.calls).toEqual([["unread"]]);
  });

  test("keeps the words a usable width beside every filter at 360 points, the tokens scrolling", async () => {
    await page.viewport(NARROW_PHONE.width, NARROW_PHONE.height);
    const { screen } = await renderPlacedField("token", {
      text: "harbour",
      conditions: ["unread", "started", "finished"],
    });
    const field = screen.getByRole("combobox").element();
    const strip = screen.getByRole("group", { name: "Filters" }).element();
    const group = field.parentElement;

    expect(group?.scrollWidth).toBe(group?.clientWidth);
    expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth);
    expect(getComputedStyle(strip).scrollbarWidth).toBe("none");
    expect(field.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      strip.getBoundingClientRect().width,
    );
  });

  test("removes the last token with backspace only once the words are gone", async () => {
    const { screen, onRemove } = await renderPlacedField("token", {
      text: "harbour",
      conditions: ["unread", "started"],
    });
    const field = screen.getByRole("combobox");
    await field.click();
    (field.element() as HTMLInputElement).setSelectionRange(0, 0);
    await userEvent.keyboard("{Backspace}");
    expect(onRemove).not.toHaveBeenCalled();

    await screen.rerender({ text: "" });
    await userEvent.keyboard("{Backspace}");

    expect(onRemove.mock.calls).toEqual([["started"]]);
  });

  test("offers Clear for tokens alone", async () => {
    const { screen, onClear, onRemove } = await renderPlacedField("token", {
      text: "",
      conditions: ["unread", "started"],
    });

    await screen.getByRole("button", { name: "Clear" }).click();

    expect(onClear).toHaveBeenCalledOnce();
    expect(onRemove).not.toHaveBeenCalled();
  });

  test("keeps the filter and Clear out of a field holding no words on an Android phone", async () => {
    const { screen } = await renderPlacedField("row", {
      text: "",
      conditions: ["unread"],
    });

    await expect
      .element(screen.getByRole("button", { name: /^Remove the/ }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Clear" }))
      .not.toBeInTheDocument();
  });
});
