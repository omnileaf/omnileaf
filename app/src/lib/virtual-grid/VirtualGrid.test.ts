import { createRawSnippet } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import VirtualGrid from "./VirtualGrid.svelte";

interface Sample {
  readonly id: string;
  readonly name: string;
}

const TEN_THOUSAND = 10_000;
const COLUMNS = 4;
const LABEL = "Samples";
const FRAMES_TO_SETTLE = 3;

const cell = createRawSnippet((sample: () => Sample) => ({
  render: () => `<p class="block-row">${sample().name}</p>`,
}));

const squareCell = createRawSnippet((sample: () => Sample) => ({
  render: () => `<p class="aspect-square">${sample().name}</p>`,
}));

function samples(count: number): Sample[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    name: `Sample ${String(index + 1)}`,
  }));
}

afterEach(() => {
  window.scrollTo(0, 0);
});

async function renderGrid(
  count: number,
  options: {
    isComplete?: boolean;
    onNearEnd?: () => void;
    cell?: typeof cell;
  } = {},
) {
  const screen = await render(VirtualGrid<Sample>, {
    items: samples(count),
    key: (sample: Sample) => sample.id,
    label: LABEL,
    isComplete: options.isComplete ?? true,
    ...(options.onNearEnd === undefined
      ? {}
      : { onNearEnd: options.onNearEnd }),
    cell: options.cell ?? cell,
    class: "grid-cols-4 gap-lg",
  });
  const list = screen.getByRole("list", { name: LABEL });
  await expect.element(list.getByRole("listitem").first()).toBeVisible();
  return { screen, list };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

/** Waits out the frames a first layout takes, so a later change is the only thing left to lay out again. */
async function settled(): Promise<void> {
  for (let frame = 0; frame < FRAMES_TO_SETTLE; frame += 1) {
    await nextFrame();
  }
}

test("lays out only the rows near the screen out of ten thousand items", async () => {
  const { list } = await renderGrid(TEN_THOUSAND);

  const laidOut = list.getByRole("listitem").elements().length;

  expect(laidOut).toBeGreaterThan(0);
  expect(laidOut).toBeLessThan(TEN_THOUSAND / 50);
});

test("makes room for every row, so the page scrolls as far as the last", async () => {
  const { list } = await renderGrid(TEN_THOUSAND);
  const item = list.getByRole("listitem").first().element();
  const rowHeight = item.getBoundingClientRect().height;

  const pageHeight = document.documentElement.scrollHeight;

  expect(pageHeight).toBeGreaterThan((TEN_THOUSAND / COLUMNS) * rowHeight);
});

test("lays out the rows scrolled to", async () => {
  const { list } = await renderGrid(TEN_THOUSAND);

  window.scrollTo(0, document.documentElement.scrollHeight / 2);
  await nextFrame();
  await nextFrame();

  const middle = list.getByText("Sample 5001", { exact: true });
  await expect.element(middle).toBeInTheDocument();
  expect(list.getByText("Sample 1", { exact: true }).elements()).toHaveLength(
    0,
  );
});

test("lays out the rows again once its items are laid out in more columns", async () => {
  const { screen, list } = await renderGrid(TEN_THOUSAND);
  await settled();
  const before = list.getByRole("listitem").elements().length;

  await screen.rerender({ class: "grid-cols-8 gap-lg" });

  await expect
    .poll(() => list.getByRole("listitem").elements().length)
    .toBe(before * 2);
});

test("fills the screen again once its styles lay items as tall as they are wide out in more columns", async () => {
  const { list } = await renderGrid(TEN_THOUSAND, { cell: squareCell });
  await settled();

  list.element().style.gridTemplateColumns = "repeat(8, minmax(0, 1fr))";

  await expect
    .poll(() => {
      const items = list.getByRole("listitem").elements();
      return items.at(-1)?.getBoundingClientRect().bottom ?? 0;
    })
    .toBeGreaterThanOrEqual(window.innerHeight);
  const first = list.getByRole("listitem").first().element();
  const rowGap = Number.parseFloat(getComputedStyle(list.element()).rowGap);
  const stride = list
    .element()
    .parentElement?.style.getPropertyValue("--row-stride");
  expect(stride).toBe(
    `${String(first.getBoundingClientRect().height + rowGap)}px`,
  );
});

test("gives each item its place in the whole list", async () => {
  const { list } = await renderGrid(TEN_THOUSAND);

  const first = list.getByRole("listitem").first();

  await expect.element(first).toHaveAttribute("aria-posinset", "1");
  await expect
    .element(first)
    .toHaveAttribute("aria-setsize", String(TEN_THOUSAND));
});

test("leaves the size of the list unknown while more items may come", async () => {
  const { list } = await renderGrid(8, { isComplete: false });

  const first = list.getByRole("listitem").first();

  await expect.element(first).toHaveAttribute("aria-setsize", "-1");
});

test("asks for more items once the screen nears the last row", async () => {
  const onNearEnd = vi.fn();

  await renderGrid(8, { isComplete: false, onNearEnd });

  await expect.poll(() => onNearEnd.mock.calls.length).toBeGreaterThan(0);
});

test("asks for nothing more far from the last row", async () => {
  const onNearEnd = vi.fn();

  await renderGrid(TEN_THOUSAND, { isComplete: false, onNearEnd });
  await nextFrame();

  expect(onNearEnd).not.toHaveBeenCalled();
});

test("asks for nothing more once the list is complete", async () => {
  const onNearEnd = vi.fn();

  await renderGrid(8, { isComplete: true, onNearEnd });
  await nextFrame();

  expect(onNearEnd).not.toHaveBeenCalled();
});
