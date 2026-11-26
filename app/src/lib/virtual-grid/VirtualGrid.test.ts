import { createRawSnippet } from "svelte";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Reveal } from "./grid-keys";
import { drawnAt, scaledDown } from "./scaled-down";
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
    total?: number;
    onNearEnd?: () => void;
    cell?: typeof cell;
    baseElement?: HTMLElement;
  } = {},
) {
  const screen = await render(
    VirtualGrid<Sample>,
    {
      items: samples(count),
      key: (sample: Sample) => sample.id,
      label: LABEL,
      isComplete: options.isComplete ?? true,
      ...(options.total === undefined ? {} : { total: options.total }),
      ...(options.onNearEnd === undefined
        ? {}
        : { onNearEnd: options.onNearEnd }),
      cell: options.cell ?? cell,
      class: "grid-cols-4 gap-lg",
    },
    { baseElement: options.baseElement ?? document.body },
  );
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
  const room = list
    .element()
    .parentElement?.style.getPropertyValue("--rows-size");
  expect(room).toBe(
    `${String((TEN_THOUSAND / 8) * (first.getBoundingClientRect().height + rowGap))}px`,
  );
});

interface Rows {
  readonly items: readonly Sample[];
  readonly cell: typeof cell;
  readonly class?: string;
  readonly itemClass?: string;
  readonly isHeading?: (sample: Sample) => boolean;
  readonly itemRole?: (sample: Sample) => "listitem" | "presentation";
  readonly onRevealReady?: (reveal: Reveal) => void;
  readonly onColumns?: (columns: number) => void;
  readonly baseElement?: HTMLElement;
}

async function renderRows({ baseElement = document.body, ...props }: Rows) {
  const screen = await render(
    VirtualGrid<Sample>,
    {
      key: (sample: Sample) => sample.id,
      label: LABEL,
      isComplete: true,
      class: "grid-cols-1",
      ...props,
    },
    { baseElement },
  );
  const list = screen.getByRole("list", { name: LABEL });
  await expect.element(list.getByRole("listitem").first()).toBeVisible();
  await settled();
  const frame = list.element().parentElement;
  if (frame === null) {
    throw new Error("the list has no frame");
  }
  return { screen, list, frame };
}

const SEPARATED_ROWS = {
  columns: 1,
  class: "grid-cols-1",
  itemClass: "border-be-8 border-solid last:border-be-0",
} as const;

const SEPARATED_PAIRS = {
  columns: 2,
  class: "grid-cols-2",
  itemClass: "border-be-8 border-solid [&:nth-last-child(-n+2)]:border-be-0",
} as const;

async function renderSeparatedRows(
  rows: number,
  {
    columns,
    ...layout
  }: typeof SEPARATED_ROWS | typeof SEPARATED_PAIRS = SEPARATED_ROWS,
) {
  const { list, frame } = await renderRows({
    items: samples(rows * columns),
    cell,
    ...layout,
  });
  const room = frame.getBoundingClientRect().height;
  return { list, frame, room, stride: room / rows };
}

function addSpace(place: "before" | "after", height: number): HTMLDivElement {
  const space = document.createElement("div");
  space.style.blockSize = `${String(height)}px`;
  document.body[place === "before" ? "prepend" : "append"](space);
  onTestFinished(() => {
    space.remove();
  });
  return space;
}

test("keeps the room of every row once only the last few, the last with no separator, are laid out", async () => {
  const rows = 10;
  const { list, frame, room, stride } = await renderSeparatedRows(rows);
  addSpace("after", room * 4);

  window.scrollTo(0, frame.offsetTop + (rows + 1.5) * stride);
  await expect
    .poll(() => list.getByText("Sample 1", { exact: true }).elements())
    .toHaveLength(0);
  await settled();

  expect(frame.getBoundingClientRect().height).toBe(room);
});

test("keeps the room of every row once only the first few are laid out below the screen", async () => {
  const { list, frame, room, stride } = await renderSeparatedRows(3);

  addSpace(
    "before",
    window.innerHeight + 1.5 * stride - frame.getBoundingClientRect().top,
  );
  window.dispatchEvent(new Event("resize"));
  await expect
    .poll(() => list.getByText("Sample 3", { exact: true }).elements())
    .toHaveLength(0);
  await settled();

  expect(frame.getBoundingClientRect().height).toBe(room);
});

test("keeps the room of every row once only the last, which has no separator, is laid out in a grid", async () => {
  const rows = 10;
  const { list, frame, room, stride } = await renderSeparatedRows(
    rows,
    SEPARATED_PAIRS,
  );
  addSpace("after", room * 4);

  window.scrollTo(0, frame.offsetTop + (rows + 1.5) * stride);
  await expect
    .poll(() => list.getByRole("listitem").elements().length)
    .toBe(SEPARATED_PAIRS.columns);
  await settled();

  expect(frame.getBoundingClientRect().height).toBe(room);
});

test("keeps the room of every row once only the first is laid out below the screen in a grid", async () => {
  const { list, frame, room, stride } = await renderSeparatedRows(
    3,
    SEPARATED_PAIRS,
  );

  addSpace(
    "before",
    window.innerHeight + 1.5 * stride - frame.getBoundingClientRect().top,
  );
  window.dispatchEvent(new Event("resize"));
  await expect
    .poll(() => list.getByRole("listitem").elements().length)
    .toBe(SEPARATED_PAIRS.columns);
  await settled();

  expect(frame.getBoundingClientRect().height).toBe(room);
});

test("measures its one row again once the row grows", async () => {
  const { list } = await renderGrid(2);
  await settled();
  const frame = list.element().parentElement;
  const before = frame?.getBoundingClientRect().height ?? 0;

  list.element().style.rowGap = "0px";
  for (const item of list.getByRole("listitem").elements()) {
    item.style.blockSize = `${String(before * 2)}px`;
  }

  await expect
    .poll(() => frame?.getBoundingClientRect().height)
    .toBeGreaterThan(before);
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

test("tells its columns before the next frame once its style asks for more covers in a row", async () => {
  const perRow = (count: number) =>
    [
      `--phone-covers-per-row: ${String(count)}`,
      `--tablet-covers-per-row: ${String(count)}`,
      `--desktop-covers-per-row: ${String(count)}`,
    ].join("; ");
  const onColumns = vi.fn<(columns: number) => void>();
  const screen = await render(VirtualGrid<Sample>, {
    items: samples(TEN_THOUSAND),
    key: (sample: Sample) => sample.id,
    label: LABEL,
    isComplete: true,
    onColumns,
    cell,
    class: "grid-cols-covers-per-row",
    style: perRow(2),
  });
  await settled();

  await screen.rerender({ style: perRow(3) });

  expect(onColumns).toHaveBeenLastCalledWith(3);
});

test("makes room for every item of the total it was told, though fewer have come", async () => {
  const { list } = await renderGrid(400, {
    isComplete: false,
    total: TEN_THOUSAND,
  });
  const item = list.getByRole("listitem").first().element();
  const rowHeight = item.getBoundingClientRect().height;

  const pageHeight = document.documentElement.scrollHeight;

  expect(pageHeight).toBeGreaterThan((TEN_THOUSAND / COLUMNS) * rowHeight);
  await expect
    .element(list.getByRole("listitem").first())
    .toHaveAttribute("aria-setsize", String(TEN_THOUSAND));
});

test("asks for more items once the rows scrolled to lie past those that have come", async () => {
  const onNearEnd = vi.fn();
  await renderGrid(400, {
    isComplete: false,
    total: TEN_THOUSAND,
    onNearEnd,
  });
  await settled();
  const beforeScrolling = onNearEnd.mock.calls.length;

  window.scrollTo(0, document.documentElement.scrollHeight / 2);

  await expect
    .poll(() => onNearEnd.mock.calls.length)
    .toBeGreaterThan(beforeScrolling);
  expect(beforeScrolling).toBe(0);
});

test("leaves the size unknown when told a total smaller than the items that have come", async () => {
  const { list } = await renderGrid(8, { isComplete: false, total: 0 });

  await expect
    .element(list.getByRole("listitem").first())
    .toHaveAttribute("aria-setsize", "-1");
});

async function renderListbox(listbox: {
  onChoose: (item: Sample) => void;
  onActivate?: (item: Sample) => void;
}) {
  const screen = await render(VirtualGrid<Sample>, {
    items: samples(4),
    key: (sample: Sample) => sample.id,
    label: LABEL,
    isComplete: true,
    cell,
    class: "grid-cols-4 gap-lg",
    listbox: { id: "samples", activeKey: undefined, ...listbox },
  });
  const options = screen.getByRole("option");
  await expect.element(options.first()).toBeVisible();
  return options;
}

function mouseDownOn(option: Element): MouseEvent {
  const press = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
  });
  option.dispatchEvent(press);
  return press;
}

test("chooses an item on a click and activates it on a double click", async () => {
  const onChoose = vi.fn();
  const onActivate = vi.fn();
  const options = await renderListbox({ onChoose, onActivate });

  await options.nth(1).dblClick();

  expect(onChoose.mock.calls.map(([sample]) => (sample as Sample).id)).toEqual([
    "1",
    "1",
  ]);
  expect(
    onActivate.mock.calls.map(([sample]) => (sample as Sample).id),
  ).toEqual(["1"]);
});

test("keeps focus where it was when an item is pressed, once items can be activated", async () => {
  const options = await renderListbox({
    onChoose: () => undefined,
    onActivate: () => undefined,
  });

  const press = mouseDownOn(options.nth(0).element());

  expect(press.defaultPrevented).toBe(true);
});

test("leaves the press of an item alone when items cannot be activated", async () => {
  const options = await renderListbox({ onChoose: () => undefined });

  const press = mouseDownOn(options.nth(0).element());

  expect(press.defaultPrevented).toBe(false);
});

const HEADING_EVERY = 3;

function withHeadings(count: number): Sample[] {
  return samples(count).map((sample, index) =>
    index % HEADING_EVERY === 0
      ? { id: `heading-${sample.id}`, name: `Heading ${String(index)}` }
      : sample,
  );
}

async function renderWithHeadings(count: number) {
  let reveal: ((index: number) => Promise<HTMLElement | undefined>) | undefined;
  const screen = await render(VirtualGrid<Sample>, {
    items: withHeadings(count),
    key: (sample: Sample) => sample.id,
    label: LABEL,
    isComplete: true,
    cell,
    class: "grid-cols-1",
    itemRole: (sample: Sample) =>
      sample.id.startsWith("heading-") ? "presentation" : "listitem",
    onRevealReady: (
      ready: (index: number) => Promise<HTMLElement | undefined>,
    ) => {
      reveal = ready;
    },
  });
  const list = screen.getByRole("list", { name: LABEL });
  await expect.element(list.getByRole("listitem").first()).toBeVisible();
  return { list, reveal: () => reveal };
}

test("numbers only the items, leaving rows shown as presentation out", async () => {
  const { list } = await renderWithHeadings(6);

  const items = list.getByRole("listitem").elements();

  expect(
    items.map((item) => [
      item.textContent,
      item.getAttribute("aria-posinset"),
      item.getAttribute("aria-setsize"),
    ]),
  ).toEqual([
    ["Sample 2", "1", "4"],
    ["Sample 3", "2", "4"],
    ["Sample 5", "3", "4"],
    ["Sample 6", "4", "4"],
  ]);
});

test("reveals the item at an index that comes after a presentation row", async () => {
  const { reveal } = await renderWithHeadings(6);

  const shown = await reveal()?.(4);

  expect(shown?.textContent).toBe("Sample 5");
});

const ROW_HEIGHT = 72;
const HEADING_HEIGHT = 44;
const RUN_LENGTH = 12;
const RUNS = 300;
const SCROLLER_HEIGHT = 400;

const isRunHeading = (sample: Sample) =>
  Number(sample.id) % (RUN_LENGTH + 1) === 0;

const runCell = createRawSnippet((sample: () => Sample) => ({
  render: () =>
    isRunHeading(sample())
      ? `<h3 style="block-size: ${String(HEADING_HEIGHT)}px">${sample().name}</h3>`
      : `<p style="block-size: ${String(ROW_HEIGHT)}px">${sample().name}</p>`,
}));

const RUN_ITEMS = samples(RUNS * (RUN_LENGTH + 1));

function expectedTopOf(index: number): number {
  const headings = Math.ceil(index / (RUN_LENGTH + 1));
  return headings * HEADING_HEIGHT + (index - headings) * ROW_HEIGHT;
}

function renderRuns(
  onRevealReady?: (reveal: Reveal) => void,
  baseElement: HTMLElement = document.body,
) {
  return renderRows({
    items: RUN_ITEMS,
    cell: runCell,
    isHeading: isRunHeading,
    itemRole: (sample: Sample) =>
      isRunHeading(sample) ? "presentation" : "listitem",
    ...(onRevealReady === undefined ? {} : { onRevealReady }),
    baseElement,
  });
}

test("makes room for every row and every shorter heading row", async () => {
  const { frame } = await renderRuns();

  expect(frame.getBoundingClientRect().height).toBe(
    expectedTopOf(RUN_ITEMS.length),
  );
});

test("lays out a row far down at its own place below the shorter headings", async () => {
  const { list, frame } = await renderRuns();
  const far = 2000;

  window.scrollTo(
    0,
    frame.getBoundingClientRect().top + window.scrollY + expectedTopOf(far),
  );
  await settled();

  const row = list.getByText(`Sample ${String(far + 1)}`, { exact: true });
  await expect.element(row).toBeInTheDocument();
  expect(
    row.element().getBoundingClientRect().top -
      frame.getBoundingClientRect().top,
  ).toBe(expectedTopOf(far));
});

test("keeps each heading row at its own height", async () => {
  const { list } = await renderRuns();

  const heading = list.getByText("Sample 14", { exact: true }).element();

  expect(heading.closest("li")?.getBoundingClientRect().height).toBe(
    HEADING_HEIGHT,
  );
});

function appendScroller(): HTMLDivElement {
  const scroller = document.createElement("div");
  scroller.style.cssText = `block-size: ${String(SCROLLER_HEIGHT)}px; overflow-y: auto`;
  document.body.append(scroller);
  onTestFinished(() => {
    scroller.remove();
  });
  return scroller;
}

test("brings a row far down into view when revealed", async () => {
  const scroller = appendScroller();
  let reveal: Reveal | undefined;
  await renderRuns((ready) => {
    reveal = ready;
  }, scroller);
  const far = 3000;

  const revealed = await reveal?.(far);

  expect(revealed?.textContent).toBe(`Sample ${String(far + 1)}`);
  const view = scroller.getBoundingClientRect();
  const box = revealed?.getBoundingClientRect();
  expect(box?.top).toBeGreaterThanOrEqual(view.top);
  expect(box?.bottom).toBeLessThanOrEqual(view.bottom);
});

const SHORT_ROW = 56;
const TALL_ROW = 88;
const GROWN_ROW = 120;
const MIXED_PATTERN = 3;

const isTallRow = (sample: Sample) =>
  Number(sample.id) % MIXED_PATTERN === MIXED_PATTERN - 1;

const mixedCell = createRawSnippet((sample: () => Sample) => ({
  render: () =>
    `<p style="block-size: ${String(isTallRow(sample()) ? TALL_ROW : SHORT_ROW)}px">${sample().name}</p>`,
}));

function mixedTopOf(index: number): number {
  const talls = Math.floor(index / MIXED_PATTERN);
  return talls * TALL_ROW + (index - talls) * SHORT_ROW;
}

const shortCell = createRawSnippet((sample: () => Sample) => ({
  render: () =>
    `<p data-sample="${sample().id}" style="block-size: ${String(SHORT_ROW)}px">${sample().name}</p>`,
}));

function growRow(index: number): void {
  const grown = document.createElement("style");
  grown.textContent = `[data-sample="${String(index)}"] { block-size: ${String(GROWN_ROW)}px !important; }`;
  document.head.append(grown);
  onTestFinished(() => {
    grown.remove();
  });
}

function renderStackedRows(count: number, rowCell = mixedCell) {
  return renderRows({ items: samples(count), cell: rowCell });
}

async function scrollToEnd(): Promise<void> {
  let height: number;
  do {
    height = document.documentElement.scrollHeight;
    window.scrollTo(0, height);
    await settled();
  } while (document.documentElement.scrollHeight !== height);
}

test("makes room for single-column rows of different heights at the sum of their heights", async () => {
  const rows = 9;

  const { frame } = await renderStackedRows(rows);

  expect(frame.getBoundingClientRect().height).toBe(mixedTopOf(rows));
});

test("leaves no blank space after the last of many rows of different heights", async () => {
  const { list, frame } = await renderStackedRows(3000);

  await scrollToEnd();

  const last = list.getByText("Sample 3000", { exact: true });
  await expect.element(last).toBeInTheDocument();
  expect(last.element().closest("li")?.getBoundingClientRect().bottom).toBe(
    frame.getBoundingClientRect().bottom,
  );
});

test("keeps the row at the top of the screen in place when a row above it grows", async () => {
  const { list, frame } = await renderStackedRows(3000, shortCell);
  const atTop = 30;
  window.scrollTo(
    0,
    frame.getBoundingClientRect().top + window.scrollY + atTop * SHORT_ROW,
  );
  await settled();
  const row = list.getByText(`Sample ${String(atTop + 1)}`, { exact: true });
  const before = row.element().getBoundingClientRect().top;

  growRow(atTop - 2);
  await settled();

  expect(row.element().getBoundingClientRect().top).toBe(before);
});

function unhandledRejections(): unknown[] {
  const reasons: unknown[] = [];
  const record = (event: PromiseRejectionEvent) => {
    reasons.push(event.reason);
    event.preventDefault();
  };
  window.addEventListener("unhandledrejection", record);
  onTestFinished(() => {
    window.removeEventListener("unhandledrejection", record);
  });
  return reasons;
}

test("stops looking at its rows once taken down while a grown row moves them", async () => {
  const rejections = unhandledRejections();
  const { screen, frame } = await renderStackedRows(3000, shortCell);
  const atTop = 30;
  window.scrollTo(
    0,
    frame.getBoundingClientRect().top + window.scrollY + atTop * SHORT_ROW,
  );
  await settled();
  const takeDown = new MutationObserver(() => {
    takeDown.disconnect();
    void screen.unmount();
  });
  takeDown.observe(frame, { attributeFilter: ["style"] });

  growRow(atTop - 2);
  await settled();

  expect(rejections).toEqual([]);
});

test("reveals nothing once taken down", async () => {
  let reveal: Reveal | undefined;
  const { screen } = await renderRuns((ready) => {
    reveal = ready;
  });
  await screen.unmount();
  const far = 3000;

  const revealed = await reveal?.(far);

  expect(revealed).toBeUndefined();
});

test("reveals nothing once taken down while bringing the row into view", async () => {
  const rejections = unhandledRejections();
  const scroller = appendScroller();
  let reveal: Reveal | undefined;
  const { screen, frame } = await renderRuns((ready) => {
    reveal = ready;
  }, scroller);
  const takeDown = new MutationObserver(() => {
    takeDown.disconnect();
    void screen.unmount();
  });
  takeDown.observe(frame, { attributeFilter: ["style"] });
  const far = 3000;

  const revealed = await reveal?.(far);

  expect(revealed).toBeUndefined();
  expect(rejections).toEqual([]);
});

const SCROLL_STEP = 20;
const FRAMES_SCROLLED = 30;
const FAR_DOWN = 2 / 3;

function firstRowOnScreen(list: Element): Element {
  const row = [...list.children].find(
    (item) => item.getBoundingClientRect().top >= 0,
  );
  if (row === undefined) {
    throw new Error("no row is on the screen");
  }
  return row;
}

test("keeps every drawn row in place on each frame while scrolling up through rows not measured yet", async () => {
  const { list, frame } = await renderStackedRows(3000);
  window.scrollTo(0, frame.getBoundingClientRect().height * FAR_DOWN);
  await settled();
  const row = firstRowOnScreen(list.element());
  const tops = [row.getBoundingClientRect().top];

  for (let step = 0; step < FRAMES_SCROLLED; step += 1) {
    window.scrollBy(0, -SCROLL_STEP);
    await nextFrame();
    tops.push(row.getBoundingClientRect().top);
  }

  expect(tops.slice(1).map((top, index) => top - (tops[index] ?? 0))).toEqual(
    Array.from({ length: FRAMES_SCROLLED }, () => SCROLL_STEP),
  );
});

const SIZING_ROWS = 3000;
const ROWS_BEFORE_RESIZING = 200;

const sizedCell = createRawSnippet((sample: () => Sample) => ({
  render: () =>
    `<p style="block-size: calc(3.5em * var(--text-scale)); box-sizing: content-box; padding-block-end: 5%">${sample().name}</p>`,
}));

test.each([
  {
    change: "the list grows narrower",
    resize: (list: HTMLElement | SVGElement) => {
      list.style.inlineSize = "50%";
    },
  },
  {
    change: "its text grows larger",
    resize: (list: HTMLElement | SVGElement) => {
      list.style.fontSize = "20px";
    },
  },
  {
    change: "the text scale grows",
    resize: () => {
      document.documentElement.style.setProperty("--text-scale", "1.5");
      onTestFinished(() => {
        document.documentElement.style.removeProperty("--text-scale");
      });
    },
  },
])("measures rows afresh once $change", async ({ resize }) => {
  const { list, frame } = await renderStackedRows(SIZING_ROWS, sizedCell);
  window.scrollTo(
    0,
    frame.getBoundingClientRect().top +
      window.scrollY +
      frame.getBoundingClientRect().height *
        (ROWS_BEFORE_RESIZING / SIZING_ROWS),
  );
  await settled();

  resize(list.element());
  await settled();

  const row = list.getByRole("listitem").first().element();
  expect(frame.getBoundingClientRect().height).toBeCloseTo(
    SIZING_ROWS * row.getBoundingClientRect().height,
    0,
  );
});

test("tells its one column once while scrolling through rows of different heights", async () => {
  const told = vi.fn<(columns: number) => void>();
  const { frame } = await renderRows({
    items: samples(3000),
    cell: mixedCell,
    onColumns: told,
  });

  for (let step = 0; step < FRAMES_SCROLLED; step += 1) {
    window.scrollBy(0, SCROLL_STEP);
    await nextFrame();
  }
  await settled();

  expect(frame.getBoundingClientRect().top).toBeLessThan(0);
  expect(told.mock.calls).toEqual([[1]]);
});

test("makes room for every row at its laid out size while drawn scaled down", async () => {
  const { list } = await renderGrid(TEN_THOUSAND, {
    cell: shortCell,
    baseElement: scaledDown(),
  });
  await settled();
  const rowGap = Number.parseFloat(getComputedStyle(list.element()).rowGap);

  const frame = list.element().parentElement;

  expect(frame?.offsetHeight).toBe(
    (TEN_THOUSAND / COLUMNS) * (SHORT_ROW + rowGap),
  );
});

test("makes room for single-column rows at their laid out heights while drawn scaled down", async () => {
  const rows = 9;

  const { frame } = await renderRows({
    items: samples(rows),
    cell: mixedCell,
    baseElement: scaledDown(),
  });

  expect(frame.offsetHeight).toBe(mixedTopOf(rows));
});

test("lays out every row on screen while drawn scaled down and scrolled partway", async () => {
  const { list } = await renderGrid(TEN_THOUSAND, {
    cell: shortCell,
    baseElement: scaledDown(),
  });
  await settled();

  const frame = list.element().parentElement;
  window.scrollTo(0, (frame?.getBoundingClientRect().height ?? 0) / 2);
  await settled();

  const drawn = list.getByRole("listitem").elements();
  expect(drawn.at(0)?.getBoundingClientRect().top).toBeLessThanOrEqual(0);
  expect(drawn.at(-1)?.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(
    window.innerHeight,
  );
});

test("keeps the measured heights of its rows and their place once drawn at full size again", async () => {
  const holder = scaledDown();
  const { frame } = await renderRows({
    items: samples(3000),
    cell: mixedCell,
    baseElement: holder,
  });
  for (let step = 0; step < FRAMES_SCROLLED; step += 1) {
    window.scrollBy(0, SCROLL_STEP);
    await nextFrame();
  }
  await settled();
  const scrolledTo = window.scrollY;
  const room = frame.offsetHeight;

  drawnAt(holder, "none");
  window.dispatchEvent(new Event("resize"));
  await settled();

  expect(frame.offsetHeight).toBe(room);
  expect(window.scrollY).toBe(scrolledTo);
});

test("brings a row far down into view when revealed while drawn scaled down in its scroller", async () => {
  const scroller = appendScroller();
  let reveal: Reveal | undefined;
  await renderRuns((ready) => {
    reveal = ready;
  }, scaledDown(scroller));
  const far = 3000;

  const revealed = await reveal?.(far);

  expect(revealed?.textContent).toBe(`Sample ${String(far + 1)}`);
  const view = scroller.getBoundingClientRect();
  const box = revealed?.getBoundingClientRect();
  expect(box?.top).toBeGreaterThanOrEqual(view.top);
  expect(box?.bottom).toBeLessThanOrEqual(view.bottom);
});

test("lays out its rows once drawn at a size again after being drawn at none", async () => {
  const holder = scaledDown();
  drawnAt(holder, "scale(0)");
  await render(
    VirtualGrid<Sample>,
    {
      items: samples(TEN_THOUSAND),
      key: (sample: Sample) => sample.id,
      label: LABEL,
      isComplete: true,
      cell: shortCell,
      class: "grid-cols-4 gap-lg",
    },
    { baseElement: holder },
  );
  await settled();

  drawnAt(holder, "none");
  window.dispatchEvent(new Event("resize"));

  const frame = holder.querySelector(".virtual-rows");
  await expect
    .poll(() => frame?.getBoundingClientRect().height)
    .toBeGreaterThan(window.innerHeight);
});
