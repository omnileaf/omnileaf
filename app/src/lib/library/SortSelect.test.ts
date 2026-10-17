import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";

import SortSelect from "./SortSelect.svelte";

const TITLE_ASCENDING = { by: "title", direction: "ascending" } as const;

test("groups the sort picker with its direction button under the sort by label", async () => {
  const screen = await render(SortSelect, {
    sort: TITLE_ASCENDING,
    onSortBy: vi.fn(),
    onReverse: vi.fn(),
  });

  const group = screen.getByRole("group", { name: "Sort by" });

  await expect
    .element(group.getByRole("combobox", { name: "Sort by" }))
    .toHaveValue("title");
  await expect
    .element(
      group.getByRole("button", { name: "Order: A to Z. Change to Z to A" }),
    )
    .toBeVisible();
});

test("reports the sort chosen in the platform picker", async () => {
  const onSortBy = vi.fn();
  const screen = await render(SortSelect, {
    sort: TITLE_ASCENDING,
    onSortBy,
    onReverse: vi.fn(),
  });

  await screen
    .getByRole("combobox", { name: "Sort by" })
    .selectOptions("Recently added");

  expect(onSortBy).toHaveBeenCalledWith("dateAdded");
});

test("offers the series read last first, as the boards draw it", async () => {
  const onSortBy = vi.fn();
  const screen = await render(SortSelect, {
    sort: TITLE_ASCENDING,
    onSortBy,
    onReverse: vi.fn(),
  });

  await screen
    .getByRole("combobox", { name: "Sort by" })
    .selectOptions("Recently read");

  expect(onSortBy).toHaveBeenCalledWith("lastRead");
});

test("lists the sorts in the order board 6.4 draws them", async () => {
  const screen = await render(SortSelect, {
    sort: TITLE_ASCENDING,
    onSortBy: vi.fn(),
    onReverse: vi.fn(),
  });

  const options = screen
    .getByRole("combobox", { name: "Sort by" })
    .getByRole("option")
    .elements()
    .map((option) => option.textContent.trim());

  expect(options).toEqual([
    "Title",
    "Recently read",
    "Recently added",
    "Last updated",
    "Unread count",
    "Time left to finish",
  ]);
});

test("notes under the sort that time left uses the reading speed once it is chosen", async () => {
  const screen = await render(SortSelect, {
    sort: { by: "timeLeft", direction: "ascending" },
    onSortBy: vi.fn(),
    onReverse: vi.fn(),
  });

  await expect
    .element(screen.getByRole("combobox", { name: "Sort by" }))
    .toHaveAccessibleDescription("Time left uses your reading speed.");
});

test("leaves the time left note out while another sort is chosen", async () => {
  const screen = await render(SortSelect, {
    sort: TITLE_ASCENDING,
    onSortBy: vi.fn(),
    onReverse: vi.fn(),
  });

  await expect
    .element(screen.getByText("Time left uses your reading speed."))
    .not.toBeInTheDocument();
});
