import type { Page } from "@playwright/test";

import { expect, sidewaysOverflow, test } from "./fixtures.ts";

type Direction = "ltr" | "rtl";

const DIRECTIONS: readonly Direction[] = ["ltr", "rtl"];

const CONTAINING_DECLARATIONS = [
  "will-change: transform",
  "backdrop-filter: blur(1px)",
  "perspective: 100px",
  "filter: blur(0)",
];

const SCREEN_READER_ONLY =
  "position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border-width: 0";

const APP_LAYOUT = "display: flex; overflow-x: clip; block-size: 100vh";
const APP_MAIN =
  "display: flex; flex: 1; flex-direction: column; overflow-y: auto; padding-inline: 48px";

const CUT_EDGES = [
  { direction: "ltr", justify: "flex-start", edge: "right" },
  { direction: "ltr", justify: "flex-end", edge: "left" },
  { direction: "rtl", justify: "flex-start", edge: "left" },
  { direction: "rtl", justify: "flex-end", edge: "right" },
] as const;

async function show(
  page: Page,
  body: string,
  direction: Direction = "ltr",
): Promise<void> {
  await page.setContent(`
    <html lang="en" dir="${direction}">
      <head><title>Sideways</title></head>
      <body style="margin: 0">${body}</body>
    </html>
  `);
}

for (const direction of DIRECTIONS) {
  test(`names the table that scrolls the app's main sideways, inside the clipping layout, ${direction}`, async ({
    page,
  }) => {
    await show(
      page,
      `<div style="${APP_LAYOUT}">
        <main style="${APP_MAIN}">
          <table id="books" style="flex: none; width: 150vw"><tr><td>Volume 1</td> <td>Pages</td></tr></table>
        </main>
      </div>`,
      direction,
    );

    const overflowing = await sidewaysOverflow(page, "body");

    expect(overflowing).toEqual([
      expect.stringMatching(
        /^<main[^>]*> scrolls \d+px sideways, reached past by <table id="books"[^>]*> “Volume 1 Pages”$/,
      ),
    ]);
  });

  test(`names what a row pushes past the start of the app's main, ${direction}`, async ({
    page,
  }) => {
    const startEdge = direction === "ltr" ? "left" : "right";
    await show(
      page,
      `<div style="${APP_LAYOUT}">
        <main style="${APP_MAIN}">
          <div id="row" style="display: flex; justify-content: flex-end">
            <div id="wide" style="flex: none; width: 150vw">Continue reading</div>
          </div>
        </main>
      </div>`,
      direction,
    );

    const overflowing = await sidewaysOverflow(page, "body");

    expect(overflowing).toContainEqual(
      expect.stringMatching(
        new RegExp(
          `^<div id="row"[^>]*> spills \\d+px past its ${startEdge} edge, reached past by <div id="wide"[^>]*> “Continue reading”$`,
        ),
      ),
    );
    expect(overflowing).toContainEqual(
      expect.stringMatching(
        /^<main[^>]*> (scrolls \d+px sideways|hides \d+px it can't scroll to), reached past by <div id="wide"[^>]*> “Continue reading”$/,
      ),
    );
  });
}

for (const { direction, justify, edge } of CUT_EDGES) {
  test(`names what a fixed root that hides its overflow cuts off past its ${edge} edge, ${direction}`, async ({
    page,
  }) => {
    await show(
      page,
      `<div id="reader" style="position: fixed; inset: 0; overflow: hidden; display: flex; justify-content: ${justify}">
        <div id="controls" style="flex: none; width: 150vw">Page 1 of 30</div>
      </div>`,
      direction,
    );

    const overflowing = await sidewaysOverflow(page, "body");

    expect(overflowing).toEqual([
      expect.stringMatching(
        new RegExp(
          `^<div id="reader"[^>]*> hides \\d+px past its ${edge} edge, reached past by <div id="controls"[^>]*> “Page 1 of 30”$`,
        ),
      ),
    ]);
  });

  test(`names what a clipping box cuts off past its ${edge} edge, ${direction}`, async ({
    page,
  }) => {
    await show(
      page,
      `<main>
        <div id="card" style="overflow-x: clip; display: flex; justify-content: ${justify}; width: 300px">
          <table id="books" style="flex: none; width: 500px"><tr><td>Volume 1</td></tr></table>
        </div>
      </main>`,
      direction,
    );

    const overflowing = await sidewaysOverflow(page);

    expect(overflowing).toEqual([
      expect.stringMatching(
        new RegExp(
          `^<div id="card"[^>]*> clips 200px past its ${edge} edge, reached past by <table id="books"[^>]*> “Volume 1”$`,
        ),
      ),
    ]);
  });
}

for (const direction of DIRECTIONS) {
  test(`names what reaches past either edge of the window, ${direction}`, async ({
    page,
  }) => {
    await show(
      page,
      `<div id="toast" style="position: fixed; inset-block-start: 0; left: -50px; width: 200px">Saved</div>
      <div id="sheet" style="position: fixed; inset-block-end: 0; right: -30px; width: 200px">Undo</div>`,
      direction,
    );

    const overflowing = await sidewaysOverflow(page, "body");

    expect(overflowing).toEqual([
      `<div id="toast" style="position: fixed; inset-block-start: 0; left: -50px; width: 200px"> “Saved” reaches 50px past the window's left edge`,
      `<div id="sheet" style="position: fixed; inset-block-end: 0; right: -30px; width: 200px"> “Undo” reaches 30px past the window's right edge`,
    ]);
  });
}

test("names what a hidden box cuts off at its start once focus scrolls it", async ({
  page,
}) => {
  await show(
    page,
    `<main>
      <div id="chips" style="overflow-x: hidden; display: flex; width: 150px">
        <button style="flex: none; width: 150px">Series</button>
        <button id="books" style="flex: none; width: 150px">Books</button>
      </div>
    </main>`,
  );
  await page.locator("#books").focus();

  const overflowing = await sidewaysOverflow(page);

  expect(overflowing).toEqual([
    expect.stringMatching(
      /^<div id="chips"[^>]*> hides 150px past its left edge, reached past by <button[^>]*> “Series”$/,
    ),
  ]);
});

test("names a box that hides the end of its own text", async ({ page }) => {
  await show(
    page,
    `<main>
      <div id="title" style="overflow: hidden; width: 100px; white-space: nowrap">
        Sample_Series_Scanned_From_The_Box_Set
      </div>
    </main>`,
  );

  const overflowing = await sidewaysOverflow(page);

  expect(overflowing).toEqual([
    expect.stringMatching(
      /^<div id="title"[^>]*> hides \d+px past its right edge, reached past by its own text “Sample_Series_Scanned_From_The_Box_Set”$/,
    ),
  ]);
});

test("leaves out what people can't see or reach past the window's edges", async ({
  page,
}) => {
  await show(
    page,
    `<main>
      <p>Shown in full</p>
      <span style="${SCREEN_READER_ONLY}">A label only screen readers hear</span>
    </main>
    <div inert style="position: fixed; inset-block: 0; inset-inline-start: 100vw; width: 300px">
      A closed drawer
    </div>
    <div aria-hidden="true" style="position: fixed; inset-block-start: 0; inset-inline-start: -50px; width: 200px; height: 20px">
      Art
    </div>`,
  );

  const overflowing = await sidewaysOverflow(page, "body");

  expect(overflowing).toEqual([]);
});

test("leaves out boxes that hide only what people can't see", async ({
  page,
}) => {
  await show(
    page,
    `<main>
      <div style="position: relative; overflow: hidden; width: 300px; height: 40px">
        <div inert style="position: absolute; inset-block: 0; left: 100%; width: 300px">A closed panel</div>
      </div>
      <div style="position: relative; overflow: hidden; width: 300px; height: 40px">
        <div aria-hidden="true" style="position: absolute; inset-block: 0; left: -50px; width: 400px">Art</div>
      </div>
      <div style="position: relative; overflow: hidden; width: 300px; height: 40px">
        <span style="${SCREEN_READER_ONLY}; left: 350px">Actions</span>
      </div>
      <div style="position: relative; overflow: hidden; width: 300px; height: 40px">
        <div style="visibility: hidden; position: absolute; inset-block: 0; left: 250px; width: 200px">Tucked tabs</div>
      </div>
    </main>`,
  );

  const overflowing = await sidewaysOverflow(page);

  expect(overflowing).toEqual([]);
});

test("names what people can't see when only it scrolls a box sideways", async ({
  page,
}) => {
  await show(
    page,
    `<main>
      <div id="shelf" style="overflow-x: auto; width: 200px">
        <div aria-hidden="true" style="width: 300px">Art</div>
      </div>
    </main>`,
  );

  const overflowing = await sidewaysOverflow(page);

  expect(overflowing).toEqual([
    expect.stringMatching(
      /^<div id="shelf"[^>]*> scrolls 100px sideways, reached past only by what people can't see: <div aria-hidden="true"[^>]*> “Art”$/,
    ),
  ]);
});

test("leaves the fill a progress bar clips alone", async ({ page }) => {
  await show(
    page,
    `<main>
      <div role="progressbar" aria-label="Volume 1" aria-valuenow="30" style="display: flex; overflow: hidden; width: 200px; height: 4px">
        <div style="flex: 1; translate: -70%"></div>
      </div>
    </main>`,
  );

  const overflowing = await sidewaysOverflow(page);

  expect(overflowing).toEqual([]);
});

test("names a box too wide for its row beside a row that bleeds into the padding on purpose", async ({
  page,
}) => {
  await show(
    page,
    `<div style="${APP_LAYOUT}">
      <main style="${APP_MAIN}">
        <section id="shelf">
          <div id="bleeding" style="margin-inline-end: -40px">Continue reading</div>
          <div id="wide" style="width: calc(100% + 20px)">Volume 1</div>
        </section>
      </main>
    </div>`,
  );

  const overflowing = await sidewaysOverflow(page, "body");

  expect(overflowing).toEqual([
    expect.stringMatching(
      /^<section id="shelf"> spills 20px past its right edge, reached past by <div id="wide"[^>]*> “Volume 1”$/,
    ),
  ]);
});

test("names the row that reaches into the end padding of the app's main and scrolls it", async ({
  page,
}) => {
  await show(
    page,
    `<div style="${APP_LAYOUT}">
      <main style="${APP_MAIN}">
        <div id="row" style="width: calc(100% + 20px)">Continue reading</div>
      </main>
    </div>`,
  );

  const overflowing = await sidewaysOverflow(page, "body");

  expect(overflowing).toEqual([
    expect.stringMatching(
      /^<main[^>]*> scrolls 20px sideways, reached into its end padding by <div id="row"[^>]*> “Continue reading”$/,
    ),
  ]);
});

test("leaves rows meant to scroll alone, even when they also overflow a pixel downwards", async ({
  page,
}) => {
  await show(
    page,
    `<main style="width: 300px">
      <div role="tablist" style="display: flex; overflow-x: auto">
        <button role="tab" style="flex: none; width: 200px">All</button>
        <button role="tab" style="flex: none; width: 200px">Reading</button>
      </div>
      <ul style="display: flex; overflow-x: auto; scroll-snap-type: x mandatory; block-size: 20px; margin: 0; padding: 0">
        <li style="flex: none; width: 200px; block-size: 21px">Volume 1</li>
        <li style="flex: none; width: 200px; block-size: 21px">Volume 2</li>
      </ul>
    </main>`,
  );

  const overflowing = await sidewaysOverflow(page);

  expect(overflowing).toEqual([]);
});

test("names a row of tabs that spills where it doesn't scroll", async ({
  page,
}) => {
  await show(
    page,
    `<main>
      <div role="tablist" style="display: flex; width: 300px">
        <button role="tab" style="flex: none; width: 200px">All</button>
        <button role="tab" style="flex: none; width: 200px">Reading</button>
      </div>
    </main>`,
  );

  const overflowing = await sidewaysOverflow(page);

  expect(overflowing).toEqual([
    expect.stringMatching(
      /^<div role="tablist"[^>]*> spills 100px past its right edge, reached past by <button role="tab"[^>]*> “Reading”$/,
    ),
  ]);
});

test("names a row of chips that scrolls where it should fit", async ({
  page,
}) => {
  await show(
    page,
    `<main>
      <div role="group" aria-label="Search in" style="display: flex; overflow-x: auto; width: 200px">
        <button style="flex: none; width: 150px">Series</button>
        <button style="flex: none; width: 150px">Books</button>
      </div>
    </main>`,
  );

  const overflowing = await sidewaysOverflow(page);

  expect(overflowing).toEqual([
    expect.stringMatching(
      /^<div role="group"[^>]*> scrolls \d+px sideways, reached past by <button[^>]*> “Books”$/,
    ),
  ]);
});

test("names what a decorative clip-path leaves showing past the window's edge", async ({
  page,
}) => {
  await show(
    page,
    `<div id="banner" style="position: fixed; inset-block-start: 0; left: 0; width: 150vw; clip-path: inset(0 round 8px)">Update ready</div>`,
  );

  const overflowing = await sidewaysOverflow(page, "body");

  expect(overflowing).toEqual([
    expect.stringMatching(
      /^<div id="banner"[^>]*> “Update ready” reaches \d+px past the window's right edge$/,
    ),
  ]);
});

test("leaves a touch target that bleeds past its bordered button alone", async ({
  page,
}) => {
  await show(
    page,
    `<style>
      #tag::before { content: ""; position: absolute; inset: -4px; }
    </style>
    <main style="padding-inline: 16px">
      <div style="display: flex">
        <button id="tag" style="position: relative; border: 1px solid; width: 100px">Add a tag</button>
      </div>
    </main>`,
  );

  const overflowing = await sidewaysOverflow(page);

  expect(overflowing).toEqual([]);
});

test("names moved and end-anchored touch targets that reach past a scrolling box", async ({
  page,
}) => {
  await show(
    page,
    `<style>
      #moved::before { content: ""; position: absolute; inset-block: 0; left: 0; width: 40px; transform: translateX(320px); }
      #anchored::after { content: ""; position: absolute; inset-block: 0; right: -150px; width: 40px; }
    </style>
    <main>
      <div style="overflow-x: auto; width: 300px; white-space: nowrap">
        <span id="moved" style="position: relative; display: inline-block; width: 100px">Moved</span><span id="anchored" style="position: relative; display: inline-block; width: 100px">Anchored</span>
      </div>
    </main>`,
  );

  const overflowing = await sidewaysOverflow(page);

  expect(overflowing).toContainEqual(
    expect.stringMatching(
      /scrolls \d+px sideways, reached past by <span id="moved"[^>]*>::before “Moved”, <span id="anchored"[^>]*>::after “Anchored”$/,
    ),
  );
});

for (const declaration of CONTAINING_DECLARATIONS) {
  test(`names what a box with ${declaration} holds when it reaches past the scrolling box around it`, async ({
    page,
  }) => {
    await show(
      page,
      `<main>
        <div style="overflow-x: auto; width: 300px; block-size: 60px">
          <div style="${declaration}; width: 200px; block-size: 20px">
            <span id="badge" style="position: absolute; left: 250px; width: 100px">New</span>
          </div>
        </div>
      </main>`,
    );

    const overflowing = await sidewaysOverflow(page);

    expect(overflowing).toContainEqual(
      expect.stringMatching(
        /scrolls 50px sideways, reached past by <span id="badge"[^>]*> “New”$/,
      ),
    );
  });
}
