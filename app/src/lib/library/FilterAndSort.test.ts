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
const TABLET = { width: 820, height: 1180 };
const IPAD_LANDSCAPE = { width: 1180, height: 820 };
const SHORT_IPAD = { width: 1180, height: 600 };
const IPHONE_LANDSCAPE = { width: 932, height: 430 };
const TITLE_INSET = 16;
const MORE_BUTTON = { right: 20, top: 24, size: 44 };
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

function addMoreButton(): HTMLButtonElement {
  const more = document.createElement("button");
  more.setAttribute("aria-label", "More for the library");
  Object.assign(more.style, {
    position: "fixed",
    top: `${String(MORE_BUTTON.top)}px`,
    right: `${String(MORE_BUTTON.right)}px`,
    width: `${String(MORE_BUTTON.size)}px`,
    height: `${String(MORE_BUTTON.size)}px`,
  });
  document.body.append(more);
  return more;
}

const MANY_CHOICES: LibraryFilterChoices = {
  ...GROUPED_CHOICES,
  languages: ["ja", "en"],
  tags: Array.from({ length: 40 }, (_, index) => `tag ${String(index)}`),
};

async function openFromMoreOn(
  platform: Platform,
  size: { width: number; height: number },
  onChoose: (listing: LibraryListing) => void = () => undefined,
  choices: LibraryFilterChoices = GROUPED_CHOICES,
) {
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await page.viewport(size.width, size.height);
  const returnFocusTo = addMoreButton();
  await render(FilterAndSort, {
    listing: NEW_LIBRARY_LISTING,
    choices,
    matching: 24,
    docks: false,
    panelId: "filters",
    isOpen: true,
    showsButton: false,
    onChoose,
    onOpen: () => undefined,
    returnFocusTo,
  });
}

function popoverFillToken(): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = "var(--native-color-popover)";
  document.body.append(probe);
  const fill = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return fill;
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

test("draws a focus ring on the picker row whose select has the keyboard focus on an iPhone", async () => {
  await openSheetOn("ios", GROUPED_CHOICES);
  const select = page.getByRole("combobox", { name: "Sort by" }).element();

  await userEvent.tab();
  while (document.activeElement !== select) {
    await userEvent.tab();
  }
  const row = select.parentElement;

  expect(row).not.toBeNull();
  expect(row === null ? "" : getComputedStyle(row).outlineStyle).toBe("solid");
});

test("describes the sort by row with the time left note on an iPhone", async () => {
  await openSheetOn("ios", GROUPED_CHOICES, {
    ...NEW_LIBRARY_LISTING,
    sort: { by: "timeLeft", direction: "ascending" },
  });

  await expect
    .element(page.getByRole("combobox", { name: "Sort by" }))
    .toHaveAccessibleDescription("Time left uses your reading speed.");
});

test("draws More tags as a native capsule beside the tag chips on an iPhone", async () => {
  await openSheetOn("ios", {
    ...GROUPED_CHOICES,
    tags: ["sea", "seinen", "slice", "school"],
  });

  const more = page.getByRole("button", { name: "More tags" }).element();
  const style = getComputedStyle(more);

  expect(more.getBoundingClientRect().height).toBe(28);
  expect(style.borderTopWidth).toBe("0px");
  expect(Number.parseFloat(style.borderTopLeftRadius)).toBeGreaterThanOrEqual(
    14,
  );
});

test.each([
  ["portrait", TABLET],
  ["landscape", IPAD_LANDSCAPE],
])(
  "opens Sort and filter on an iPad in %s as a popover under More, lined up with its right edge",
  async (_, size) => {
    await openFromMoreOn("ios", size);

    const popover = page.getByRole("dialog", { name: "Sort and filter" });
    const more = boxOf(
      page.getByRole("button", { name: "More for the library" }).element(),
    );

    expect(boxOf(popover.element()).width).toBe(360);
    await expect
      .poll(() => Math.round(boxOf(popover.element()).right))
      .toBe(more.right);
    await expect
      .poll(() => Math.round(boxOf(popover.element()).top))
      .toBeGreaterThanOrEqual(more.bottom);
  },
);

test("draws the iPad's Sort and filter popover on the same glass as View options", async () => {
  await openFromMoreOn("ios", TABLET);

  const style = getComputedStyle(page.getByRole("dialog").element());

  expect(style.borderRadius).toBe("38px");
  expect(style.borderTopWidth).toBe("0px");
  expect(style.backgroundColor).toBe(popoverFillToken());
  expect(style.backdropFilter).toContain("blur(30px)");
  expect([style.paddingTop, style.paddingBottom]).toEqual(["20px", "6px"]);
});

test("sets the iPad popover's title as a 17 semibold headline with Reset at its end", async () => {
  await openFromMoreOn("ios", TABLET);

  const title = page.getByRole("heading", { name: "Sort and filter" });
  const reset = page.getByRole("button", { name: "Reset" });

  expect([
    getComputedStyle(title.element()).fontSize,
    getComputedStyle(title.element()).fontWeight,
  ]).toEqual(["17px", "600"]);
  expect(boxOf(reset.element()).left).toBeGreaterThan(
    boxOf(title.element()).right,
  );
  const dialog = boxOf(page.getByRole("dialog").element());

  expect(dialog.right - boxOf(reset.element()).right).toBe(TITLE_INSET);
  expect(
    boxOf(title.element()).left +
      parseFloat(getComputedStyle(title.element()).paddingLeft) -
      dialog.left,
  ).toBe(TITLE_INSET);
});

test("keeps the iPad popover inside a short screen and scrolls its long content", async () => {
  await openFromMoreOn("ios", SHORT_IPAD, undefined, MANY_CHOICES);

  const popover = page.getByRole("dialog").element();
  const more = boxOf(
    page.getByRole("button", { name: "More for the library" }).element(),
  );

  await expect.poll(() => Math.round(boxOf(popover).right)).toBe(more.right);
  expect(boxOf(popover).bottom).toBeLessThanOrEqual(SHORT_IPAD.height);
  expect(popover.scrollHeight).toBeGreaterThan(popover.clientHeight);
});

test("does not put the keyboard focus on Reset when the iPad popover opens", async () => {
  await openFromMoreOn("ios", TABLET);

  const popover = page.getByRole("dialog").element();

  await expect.poll(() => popover.contains(document.activeElement)).toBe(true);
  expect(document.activeElement).not.toBe(
    page.getByRole("button", { name: "Reset" }).element(),
  );
});

test("keeps the full height side panel on an iPhone turned sideways", async () => {
  await openFromMoreOn("ios", IPHONE_LANDSCAPE);

  const panel = boxOf(page.getByRole("dialog").element());

  expect(Math.round(panel.height)).toBe(IPHONE_LANDSCAPE.height);
  expect(panel.width).not.toBe(360);
});

test("resets the listing from the iPad popover's Reset button", async () => {
  const chosen: LibraryListing[] = [];
  await openFromMoreOn("ios", TABLET, (listing) => chosen.push(listing));

  await userEvent.click(page.getByRole("button", { name: "Reset" }));

  expect(chosen).toEqual([NEW_LIBRARY_LISTING]);
});

test("lists Sort by, Order and Read state as picker rows in divided groups in the iPad popover", async () => {
  await openFromMoreOn("ios", TABLET);

  for (const name of ["Sort by", "Order", "Read state"]) {
    await expect
      .element(page.getByRole("combobox", { name }))
      .toBeInTheDocument();
  }
  const heading = getComputedStyle(
    page.getByRole("heading", { name: "Sort", exact: true }).element(),
  );
  const group = getComputedStyle(groupAfter("Sort"));

  expect([heading.fontSize, heading.fontWeight]).toEqual(["13px", "590"]);
  expect(group.borderRadius).toBe("0px");
  expect(group.backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

test("leaves out the iPhone's Close button and match count button in the iPad popover", async () => {
  await openFromMoreOn("ios", TABLET);

  await expect
    .element(page.getByRole("button", { name: "Close" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Show 24 series" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent("24 series match");
});

test.each<Platform>(["macos", "windows", "android", "linux"])(
  "keeps the side panel on a wide %s window",
  async (platform) => {
    await openFromMoreOn(platform, WIDE);

    const panel = boxOf(page.getByRole("dialog").element());

    expect(panel.width).toBeLessThan(WIDE.width / 2);
    expect(Math.round(panel.height)).toBe(WIDE.height);
  },
);
