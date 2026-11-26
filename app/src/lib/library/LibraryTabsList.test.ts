import { afterEach, expect, test, vi } from "vitest";
import { tick } from "svelte";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import type { LibraryCategory } from "#lib/ipc/bindings.ts";

import type { ArrangedTab } from "./library-tabs.ts";
import LibraryTabsList from "./LibraryTabsList.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
  vi.restoreAllMocks();
});

const TABS: readonly ArrangedTab[] = [
  { id: { kind: "all" }, name: "All", isHidden: false },
  { id: { kind: "newChapters" }, name: "New chapters", isHidden: true },
];

const PROPS = {
  tabs: TABS,
  detailOf: () => "Built in",
  onArrange: () => undefined,
};

function categoryTab(id: string, name: string): ArrangedTab {
  return {
    id: { kind: "category", id: id as LibraryCategory["id"] },
    name,
    isHidden: false,
  };
}

const CATEGORY_TABS: readonly ArrangedTab[] = [
  ...TABS,
  categoryTab("reading", "Reading"),
  categoryTab("manga", "Manga"),
];
const FIRST_POINTER = 1;
const SECOND_POINTER = 2;
const NUDGE = 10;

function rowNamed(name: string, within: ParentNode): HTMLElement {
  const handle = element(`[aria-label^="Move ${name}"]`, within);
  const row = handle.closest("[data-tab-row]");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no row holds the handle for ${name}`);
  }
  return row;
}

function press(row: HTMLElement, pointerId: number, type: string, by = 0) {
  const handle = element("[data-tab-handle]", row);
  const { top, height } = handle.getBoundingClientRect();
  handle.dispatchEvent(
    new PointerEvent(type, {
      pointerId,
      button: 0,
      buttons: 1,
      clientY: top + height / 2 + by,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function liftBy(row: HTMLElement, pointerId: number, by: number): void {
  press(row, pointerId, "pointerdown");
  press(row, pointerId, "pointermove", by);
}

function element(selector: string, within: ParentNode): HTMLElement {
  const found = within.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`nothing matches ${selector}`);
  }
  return found;
}

test("draws the Android drag handle and More button as 40px buttons with bare 24px Material icons", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryTabsList, PROPS);

  const row = element("[data-tab-row]", screen.container);
  const handle = element("[data-tab-handle]", row);
  const more = element("button[aria-label^='More for']", row);
  const grip = element("[data-icon=grip-vertical]", handle);
  const dots = element("[data-icon=ellipsis]", more);

  expect(handle.getBoundingClientRect().width).toBeCloseTo(40, 0);
  expect(more.getBoundingClientRect().width).toBeCloseTo(40, 0);
  expect(more.getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(
    parseFloat(getComputedStyle(more).borderRadius),
  ).toBeGreaterThanOrEqual(20);
  expect(grip.getBoundingClientRect().width).toBeCloseTo(24, 0);
  expect(dots.getBoundingClientRect().width).toBeCloseTo(24, 0);
  expect(row.querySelector("svg")).toBeNull();
});

test("sets the Android Hidden badge without a border, 12px medium on a filled 8px corner", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryTabsList, PROPS);

  const badge = element("[data-tab-badge]", screen.container);
  const style = getComputedStyle(badge);
  const icon = element("[data-icon=eye-off]", badge);

  expect(style.borderTopWidth).toBe("0px");
  expect(style.borderRadius).toBe("8px");
  expect(style.fontSize).toBe("12px");
  expect(style.fontWeight).toBe("500");
  expect(style.letterSpacing).toBe("0.5px");
  expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(badge.getBoundingClientRect().height).toBeCloseTo(24, 0);
  expect(icon.getBoundingClientRect().width).toBeCloseTo(14, 0);
});

test("sets the Android tab name with 0.5px tracking", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryTabsList, PROPS);

  const name = screen.getByText("All", { exact: true }).element();

  expect(getComputedStyle(name).letterSpacing).toBe("0.5px");
});

test("keeps the outlined Hidden badge and Lucide icons off Android", async () => {
  const screen = await render(LibraryTabsList, PROPS);

  const badge = element("[data-tab-badge]", screen.container);

  expect(getComputedStyle(badge).borderTopWidth).toBe("1px");
  expect(screen.container.querySelector("[data-icon]")).toBeNull();
});

test("offers no New category row without a way to make one", async () => {
  const screen = await render(LibraryTabsList, PROPS);

  expect(
    screen.getByRole("button", { name: "New category" }).query(),
  ).toBeNull();
});

test("sets New category after the tabs, outside their list", async () => {
  const screen = await render(LibraryTabsList, {
    ...PROPS,
    onNewCategory: () => undefined,
  });

  const add = screen.getByRole("button", { name: "New category" }).element();
  const list = screen.getByRole("list").element();

  expect(list.contains(add)).toBe(false);
  expect(
    list.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("calls onNewCategory when New category is pressed", async () => {
  let presses = 0;
  const screen = await render(LibraryTabsList, {
    ...PROPS,
    onNewCategory: () => {
      presses += 1;
    },
  });

  await screen.getByRole("button", { name: "New category" }).click();

  expect(presses).toBe(1);
});

for (const platform of ["android", "ios", "linux"] as const) {
  test(`says a move to screen readers without drawing it on ${platform}`, async () => {
    followCorePlatform(platform);
    const screen = await render(LibraryTabsList, PROPS);
    const handle = screen.getByRole("button", { name: "Move All" });

    handle.element().focus();
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");

    const status = screen.getByRole("status").element();
    expect(status.textContent).toContain("All moved down, to position 2 of 2");
    expect(status.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(getComputedStyle(status).clipPath).not.toBe("none");
  });
}

const CHANGES_UNDER_A_DRAG = {
  "the dragged tab leaves the list": CATEGORY_TABS.filter(
    ({ name }) => name !== "Reading",
  ),
  "a tab above it leaves the list": CATEGORY_TABS.filter(
    ({ name }) => name !== "All",
  ),
  "a tab joins the list": [...CATEGORY_TABS, categoryTab("comics", "Comics")],
} satisfies Record<string, readonly ArrangedTab[]>;

for (const [change, tabs] of Object.entries(CHANGES_UNDER_A_DRAG)) {
  test(`lets go of a drag when ${change}, so the next drag starts`, async () => {
    vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(
      () => undefined,
    );
    const screen = await render(LibraryTabsList, {
      ...PROPS,
      tabs: CATEGORY_TABS,
    });
    liftBy(rowNamed("Reading", screen.container), FIRST_POINTER, NUDGE);

    await screen.rerender({ tabs });
    const manga = rowNamed("Manga", screen.container);
    const rest = manga.getBoundingClientRect().top;
    liftBy(manga, SECOND_POINTER, -NUDGE);
    await tick();

    expect(manga.getBoundingClientRect().top).toBeCloseTo(rest - NUDGE, 0);
  });
}

test("ignores Alt and the arrow keys while a tab is dragged", async () => {
  vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(
    () => undefined,
  );
  const onArrange = vi.fn();
  const screen = await render(LibraryTabsList, {
    ...PROPS,
    tabs: CATEGORY_TABS,
    onArrange,
  });
  liftBy(rowNamed("Reading", screen.container), FIRST_POINTER, NUDGE);

  element(
    "[data-tab-handle]",
    rowNamed("Manga", screen.container),
  ).dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "ArrowUp",
      altKey: true,
      bubbles: true,
    }),
  );

  expect(onArrange).not.toHaveBeenCalled();
});

function menuItemNames(): readonly string[] {
  return [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
    item.textContent.trim(),
  );
}

const RENAMING_PROPS = {
  ...PROPS,
  tabs: CATEGORY_TABS,
  onRename: () => undefined,
  onDelete: () => undefined,
};

test("ends a category's menu with Rename and then Delete in the danger colour", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryTabsList, RENAMING_PROPS);

  await screen.getByRole("button", { name: "More for Manga" }).click();

  expect(menuItemNames()).toEqual([
    "Move up",
    "Move down",
    "Hide this tab",
    "Rename",
    "Delete",
  ]);
  const remove = screen.getByRole("menuitem", { name: "Delete" }).element();
  expect(remove.classList.contains("text-danger")).toBe(true);
  expect(remove.querySelector("svg")).not.toBeNull();
  expect(
    screen
      .getByRole("menuitem", { name: "Rename" })
      .element()
      .querySelector("svg"),
  ).not.toBeNull();
  expect(
    document.querySelectorAll('[role="menu"] [role="separator"]'),
  ).toHaveLength(2);
});

test("offers neither Rename nor Delete for the built-in tabs", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryTabsList, RENAMING_PROPS);

  await screen.getByRole("button", { name: "More for New chapters" }).click();

  expect(menuItemNames()).toEqual(["Move up", "Move down", "Show this tab"]);
});

test("asks with an ellipsis before renaming or deleting on a desktop", async () => {
  followCorePlatform("linux");
  const screen = await render(LibraryTabsList, RENAMING_PROPS);

  await screen.getByRole("button", { name: "More for Reading" }).click();

  expect(menuItemNames().slice(-2)).toEqual(["Rename…", "Delete…"]);
});

test("hands the category chosen to onRename and onDelete", async () => {
  followCorePlatform("linux");
  const onRename = vi.fn();
  const onDelete = vi.fn();
  const screen = await render(LibraryTabsList, {
    ...RENAMING_PROPS,
    onRename,
    onDelete,
  });

  await screen.getByRole("button", { name: "More for Manga" }).click();
  await screen.getByRole("menuitem", { name: "Rename…" }).click();
  await screen.getByRole("button", { name: "More for Reading" }).click();
  await screen.getByRole("menuitem", { name: "Delete…" }).click();

  expect(onRename).toHaveBeenCalledWith(CATEGORY_TABS[3]);
  expect(onDelete).toHaveBeenCalledWith(CATEGORY_TABS[2]);
});
