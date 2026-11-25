import { createRawSnippet } from "svelte";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import VirtualTable from "./VirtualTable.svelte";

interface Sample {
  readonly id: string;
  readonly name: string;
}

const TEN_THOUSAND = 10_000;
const LABEL = "Samples";
const SHOWN_SCALE = 0.5;
const ROW_HEIGHT = 40;

const head = createRawSnippet(() => ({
  render: () => `<thead><tr aria-rowindex="1"><th>Name</th></tr></thead>`,
}));

const row = createRawSnippet(
  (sample: () => Sample, rowIndex: () => number) => ({
    render: () =>
      `<tr aria-rowindex="${String(rowIndex())}"><td class="block-row">${sample().name}</td></tr>`,
  }),
);

function samples(count: number): Sample[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    name: `Sample ${String(index + 1)}`,
  }));
}

afterEach(() => {
  window.scrollTo(0, 0);
});

const fixedRow = createRawSnippet(
  (sample: () => Sample, rowIndex: () => number) => ({
    render: () =>
      `<tr aria-rowindex="${String(rowIndex())}" style="block-size: ${String(ROW_HEIGHT)}px"><td>${sample().name}</td></tr>`,
  }),
);

function scaledDown(): HTMLDivElement {
  const holder = document.createElement("div");
  holder.style.transform = `scale(${String(SHOWN_SCALE)})`;
  holder.style.transformOrigin = "0 0";
  document.body.append(holder);
  onTestFinished(() => {
    holder.remove();
  });
  return holder;
}

async function renderTable(
  count: number,
  options: {
    isComplete?: boolean;
    onNearEnd?: () => void;
    row?: typeof row;
    baseElement?: HTMLElement;
  } = {},
) {
  await render(
    VirtualTable<Sample>,
    {
      items: samples(count),
      key: (sample: Sample) => sample.id,
      label: LABEL,
      columns: 1,
      isComplete: options.isComplete ?? true,
      ...(options.onNearEnd === undefined
        ? {}
        : { onNearEnd: options.onNearEnd }),
      head,
      row: options.row ?? row,
    },
    { baseElement: options.baseElement ?? document.body },
  );
  const table = document.querySelector<HTMLTableElement>(
    `table[aria-label="${LABEL}"]`,
  );
  if (table === null) {
    throw new Error("the table isn't on the page");
  }
  await expect.poll(() => bodyRows(table).length).toBeGreaterThan(0);
  return table;
}

function bodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return [...table.querySelectorAll<HTMLTableRowElement>("tbody tr")].filter(
    (tableRow) => tableRow.getAttribute("aria-hidden") !== "true",
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

test("lays out only the rows near the screen out of ten thousand items", async () => {
  const table = await renderTable(TEN_THOUSAND);
  await nextFrame();

  const laidOut = bodyRows(table).length;

  expect(laidOut).toBeLessThan(TEN_THOUSAND / 50);
});

test("makes room for every row, so the page scrolls as far as the last", async () => {
  const table = await renderTable(TEN_THOUSAND);
  await nextFrame();
  const rowHeight = bodyRows(table)[0]?.getBoundingClientRect().height ?? 0;

  const pageHeight = document.documentElement.scrollHeight;

  expect(pageHeight).toBeGreaterThan(TEN_THOUSAND * rowHeight);
});

test("lays out the rows scrolled to", async () => {
  const table = await renderTable(TEN_THOUSAND);
  await nextFrame();

  window.scrollTo(0, document.documentElement.scrollHeight / 2);
  await nextFrame();
  await nextFrame();

  const names = bodyRows(table).map((tableRow) => tableRow.textContent);
  expect(names).toContain("Sample 5001");
  expect(names).not.toContain("Sample 1");
});

test("gives each row its place in the whole table, counting the heading row", async () => {
  const table = await renderTable(TEN_THOUSAND);

  const first = bodyRows(table)[0];

  expect(first?.getAttribute("aria-rowindex")).toBe("2");
  expect(table.getAttribute("aria-rowcount")).toBe(String(TEN_THOUSAND + 1));
});

test("leaves the number of rows unknown while more items may come", async () => {
  const table = await renderTable(8, { isComplete: false });

  expect(table.getAttribute("aria-rowcount")).toBe("-1");
});

test("asks for more items once the screen nears the last row", async () => {
  const onNearEnd = vi.fn();

  await renderTable(8, { isComplete: false, onNearEnd });

  await expect.poll(() => onNearEnd.mock.calls.length).toBeGreaterThan(0);
});

test("asks for nothing more far from the last row", async () => {
  const onNearEnd = vi.fn();

  await renderTable(TEN_THOUSAND, { isComplete: false, onNearEnd });
  await nextFrame();

  expect(onNearEnd).not.toHaveBeenCalled();
});

test("makes room for every row at its laid out height while drawn scaled down", async () => {
  const table = await renderTable(TEN_THOUSAND, {
    row: fixedRow,
    baseElement: scaledDown(),
  });
  await nextFrame();

  const body = table.tBodies.item(0);

  expect(body?.offsetHeight).toBe(TEN_THOUSAND * ROW_HEIGHT);
});

test("lays out every row on screen while drawn scaled down", async () => {
  const table = await renderTable(TEN_THOUSAND, {
    row: fixedRow,
    baseElement: scaledDown(),
  });
  await nextFrame();
  await nextFrame();

  const last = bodyRows(table).at(-1);

  expect(last?.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(
    window.innerHeight,
  );
});
