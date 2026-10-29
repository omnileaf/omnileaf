import { afterEach, beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type {
  LibraryFilterChoices,
  LibraryListing,
  Platform,
} from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import FilterAndSort from "./FilterAndSort.svelte";
import { NEW_LIBRARY_LISTING } from "./library-listing";

const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 800 };
const LARGE_DETENT = 0.92;

const CHOICES: LibraryFilterChoices = {
  formats: ["comic", "manga"],
  languages: [],
  tags: [],
  ratesAdult: false,
  keepsBookmarks: false,
  smart: [],
};

const GROUPED_CHOICES: LibraryFilterChoices = {
  formats: ["comic", "manga"],
  languages: ["ja"],
  tags: ["sea"],
  ratesAdult: true,
  keepsBookmarks: true,
  smart: ["quickReads", "forgotten", "duplicates"],
};

async function openSheetOn(
  platform: Platform,
  choices: LibraryFilterChoices = CHOICES,
  listing: LibraryListing = NEW_LIBRARY_LISTING,
  onChoose: (listing: LibraryListing) => void = () => undefined,
) {
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await page.viewport(PHONE.width, PHONE.height);
  await render(FilterAndSort, {
    listing,
    choices,
    matching: 24,
    docks: false,
    panelId: "filters",
    isOpen: true,
    showsButton: false,
    onChoose,
    onOpen: () => undefined,
  });
}

function boxOf(element: Element): DOMRect {
  return element.getBoundingClientRect();
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("raises the sort and filter sheet to the large detent on an iPhone", async () => {
  await openSheetOn("ios");

  const sheet = page.getByRole("dialog").element();

  expect(Math.round(boxOf(sheet).height)).toBe(
    Math.round(PHONE.height * LARGE_DETENT),
  );
});

test("puts Close and Reset on either side of a centred title on an iPhone", async () => {
  await openSheetOn("ios");

  const close = boxOf(page.getByRole("button", { name: "Close" }).element());
  const title = boxOf(
    page.getByText("Sort and filter", { exact: true }).element(),
  );
  const reset = boxOf(page.getByRole("button", { name: "Reset" }).element());

  expect(close.right).toBeLessThanOrEqual(title.left);
  expect(title.right).toBeLessThanOrEqual(reset.left);
  expect(Math.abs(title.left + title.width / 2 - PHONE.width / 2)).toBeLessThan(
    1,
  );
  expect(close.width).toBe(close.height);
});

test("ends the sheet with a full-width large primary button counting the matches on an iPhone", async () => {
  await openSheetOn("ios");

  const sheet = boxOf(page.getByRole("dialog").element());
  const show = page.getByRole("button", { name: "Show 24 series" }).element();

  expect(boxOf(show).height).toBe(50);
  expect(sheet.width - boxOf(show).width).toBe(32);
  expect(getComputedStyle(show).backgroundColor).toBe("rgb(47, 111, 79)");
});

test("keeps the sort and filter sheet as it was on an Android phone", async () => {
  await openSheetOn("android");

  const sheet = boxOf(page.getByRole("dialog").element());
  const show = boxOf(
    page.getByRole("button", { name: "Show 24 series" }).element(),
  );

  await expect
    .element(page.getByRole("button", { name: "Close" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Reset" }))
    .toBeInTheDocument();
  expect(Math.round(sheet.height)).not.toBe(
    Math.round(PHONE.height * LARGE_DETENT),
  );
  expect(show.height).not.toBe(50);
});

test("keeps the side panel on a wide iOS window", async () => {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  await page.viewport(WIDE.width, WIDE.height);
  await render(FilterAndSort, {
    listing: NEW_LIBRARY_LISTING,
    choices: CHOICES,
    matching: 24,
    docks: false,
    panelId: "filters",
    isOpen: true,
    showsButton: false,
    onChoose: () => undefined,
    onOpen: () => undefined,
  });

  const panel = boxOf(page.getByRole("dialog").element());

  expect(panel.width).toBeLessThan(WIDE.width / 2);
  expect(Math.round(panel.height)).toBe(WIDE.height);
});

function groupAfter(heading: string): HTMLElement {
  const title = page.getByRole("heading", { name: heading, exact: true });
  const group = title.element().nextElementSibling;
  if (!(group instanceof HTMLElement)) {
    throw new Error(`no group follows ${heading}`);
  }
  return group;
}

test("draws Sort, Filter and Smart filters as inset groups on a grouped ground on an iPhone", async () => {
  await openSheetOn("ios", GROUPED_CHOICES);

  const sheet = page.getByRole("dialog").element();
  const sheetBox = boxOf(sheet);

  expect(sheet.getAttribute("data-ground")).toBe("grouped");
  for (const heading of ["Sort", "Filter", "Smart filters"]) {
    const group = groupAfter(heading);
    const box = boxOf(group);
    const style = getComputedStyle(group);

    expect(box.left - sheetBox.left).toBe(16);
    expect(sheetBox.right - box.right).toBe(16);
    expect(style.borderRadius).toBe("26px");
    expect(style.backgroundColor).toBe("rgb(255, 255, 255)");
  }
  expect(getComputedStyle(sheet).backgroundColor).toBe("rgb(242, 242, 247)");
});

test("sets each group's header in muted semibold type above its group on an iPhone", async () => {
  await openSheetOn("ios", GROUPED_CHOICES);

  const sheetBox = boxOf(page.getByRole("dialog").element());
  const title = page.getByRole("heading", { name: "Filter", exact: true });
  const style = getComputedStyle(title.element());

  expect(
    boxOf(title.element()).left + parseFloat(style.paddingLeft) - sheetBox.left,
  ).toBe(32);
  expect(style.fontSize).toBe("17px");
  expect(style.fontWeight).toBe("590");
  expect(style.color).not.toBe(getComputedStyle(document.body).color);
  expect(boxOf(groupAfter("Filter")).top - boxOf(title.element()).bottom).toBe(
    8,
  );
});

test("puts the smart filters hint under its group as a footer on an iPhone", async () => {
  await openSheetOn("ios", GROUPED_CHOICES);

  const group = boxOf(groupAfter("Smart filters"));
  const hint = page.getByText("They combine with the filters above.");
  const box = boxOf(hint.element());

  expect(box.top - group.bottom).toBe(8);
  expect(
    box.left +
      parseFloat(getComputedStyle(hint.element()).paddingLeft) -
      group.left,
  ).toBe(16);
  expect(getComputedStyle(hint.element()).fontSize).toBe("13px");
});

test("keeps the unframed sections on an iPad", async () => {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  await page.viewport(820, 1180);
  await render(FilterAndSort, {
    listing: NEW_LIBRARY_LISTING,
    choices: GROUPED_CHOICES,
    matching: 24,
    docks: false,
    panelId: "filters",
    isOpen: true,
    showsButton: false,
    onChoose: () => undefined,
    onOpen: () => undefined,
  });

  const sheet = page.getByRole("dialog").element();

  expect(sheet.getAttribute("data-ground")).toBeNull();
  const heading = page.getByRole("heading", { name: "Filter", exact: true });

  expect(getComputedStyle(groupAfter("Filter")).borderRadius).not.toBe("26px");
  expect(getComputedStyle(heading.element()).fontWeight).toBe("600");
  expect(getComputedStyle(heading.element()).paddingLeft).toBe("0px");
});

test("lists Sort by and Order as picker rows with their value and a chevron on an iPhone", async () => {
  await openSheetOn("ios", GROUPED_CHOICES);

  const group = groupAfter("Sort");
  const sortBy = page.getByRole("combobox", { name: "Sort by" });
  const order = page.getByRole("combobox", { name: "Order" });

  await expect.element(sortBy).toHaveDisplayValue("Title");
  await expect.element(order).toHaveDisplayValue("A to Z");
  expect(group.contains(sortBy.element())).toBe(true);
  expect(group.contains(order.element())).toBe(true);
  for (const row of [sortBy, order]) {
    const box = boxOf(row.element());
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThan(300);
  }
  expect(group.querySelectorAll("svg.lucide-chevron-right")).toHaveLength(2);
});

test("sorts by the series property picked in the Sort by row on an iPhone", async () => {
  const chosen: LibraryListing[] = [];
  await openSheetOn("ios", GROUPED_CHOICES, NEW_LIBRARY_LISTING, (listing) => {
    chosen.push(listing);
  });

  await userEvent.selectOptions(
    page.getByRole("combobox", { name: "Sort by" }),
    "Recently read",
  );

  expect(chosen.map((listing) => listing.sort.by)).toEqual(["lastRead"]);
});

test("reverses the order from the Order row on an iPhone", async () => {
  const chosen: LibraryListing[] = [];
  await openSheetOn("ios", GROUPED_CHOICES, NEW_LIBRARY_LISTING, (listing) => {
    chosen.push(listing);
  });

  await userEvent.selectOptions(
    page.getByRole("combobox", { name: "Order" }),
    "Z to A",
  );

  expect(chosen.map((listing) => listing.sort.direction)).toEqual([
    "descending",
  ]);
});

test("opens the read state as the first picker row of the Filter group on an iPhone", async () => {
  const chosen: LibraryListing[] = [];
  await openSheetOn("ios", GROUPED_CHOICES, NEW_LIBRARY_LISTING, (listing) => {
    chosen.push(listing);
  });
  const readState = page.getByRole("combobox", { name: "Read state" });

  await expect.element(readState).toHaveDisplayValue("Any");
  expect(
    groupAfter("Filter").firstElementChild?.contains(readState.element()),
  ).toBe(true);
  await userEvent.selectOptions(readState, "Unread");

  expect(chosen).toHaveLength(1);
  expect(chosen[0]?.filter.started).toBe("hide");
});

test("puts the time left note under the Sort group as a footer on an iPhone", async () => {
  await openSheetOn("ios", GROUPED_CHOICES, {
    ...NEW_LIBRARY_LISTING,
    sort: { by: "timeLeft", direction: "ascending" },
  });

  const group = boxOf(groupAfter("Sort"));
  const note = boxOf(
    page.getByText("Time left uses your reading speed.").element(),
  );

  expect(note.top - group.bottom).toBe(8);
});

test("keeps the sort select and direction button on an iPad", async () => {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  await page.viewport(820, 1180);
  await render(FilterAndSort, {
    listing: NEW_LIBRARY_LISTING,
    choices: GROUPED_CHOICES,
    matching: 24,
    docks: false,
    panelId: "filters",
    isOpen: true,
    showsButton: false,
    onChoose: () => undefined,
    onOpen: () => undefined,
  });

  await expect
    .element(page.getByRole("combobox", { name: "Order" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: /^Order:/ }))
    .toBeInTheDocument();
});
