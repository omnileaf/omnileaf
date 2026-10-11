import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeAll, expect, inject, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { createSampleLibrary } from "./sample-library.ts";
import { turnScheduledChecks } from "./scheduled-checks.ts";
import { xpath } from "./webdriver.ts";

const ADDED_SERIES = "Series Added While Watched";
const ADDED_BOOK = "Chapter 01";
const SAMPLE_PAGE = join("Sample Series 03", "Chapter 01", "001.png");
const SHOWN_WITHIN_MS = 3_000;

const ADDED_SERIES_TITLE = xpath(
  `//main//*[normalize-space()='${ADDED_SERIES}']`,
);
const ADDED_SERIES_GONE = `return document.evaluate(${JSON.stringify(ADDED_SERIES_TITLE.value)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue === null;`;

const appSession = useAppSession();

function addedSeries(): string {
  return join(inject("libraryHome"), ADDED_SERIES);
}

async function samplePage(): Promise<Buffer> {
  const sample = await createSampleLibrary();
  try {
    return await readFile(join(sample.folder, SAMPLE_PAGE));
  } finally {
    await sample.remove();
  }
}

async function addOnePageBook(page: Buffer): Promise<void> {
  const book = join(addedSeries(), ADDED_BOOK);
  await mkdir(book, { recursive: true });
  await writeFile(join(book, "001.png"), page);
}

beforeAll(async () => {
  await turnScheduledChecks(appSession(), true);
});

afterEach(async () => {
  await rm(addedSeries(), { recursive: true, force: true });
  await appSession().waitUntil(ADDED_SERIES_GONE, "the added series gone");
});

test("lists a book added to the home folder within three seconds", async () => {
  const page = await samplePage();

  await addOnePageBook(page);

  const title = await appSession().waitFor(ADDED_SERIES_TITLE, SHOWN_WITHIN_MS);
  expect(await title.text()).toBe(ADDED_SERIES);
});

test("stops listing a book removed from the home folder within three seconds", async () => {
  await addOnePageBook(await samplePage());
  await appSession().waitFor(ADDED_SERIES_TITLE);

  await rm(addedSeries(), { recursive: true, force: true });

  const gone = appSession().waitUntil(
    ADDED_SERIES_GONE,
    "the removed series gone",
    SHOWN_WITHIN_MS,
  );
  await expect(gone).resolves.toBeUndefined();
});

test("lists no book added to the home folder while scheduled rescans are off", async () => {
  const page = await samplePage();
  await turnScheduledChecks(appSession(), false);
  try {
    await addOnePageBook(page);

    const shown = appSession().waitFor(ADDED_SERIES_TITLE, SHOWN_WITHIN_MS);

    await expect(shown).rejects.toThrow("was not ready");
  } finally {
    await turnScheduledChecks(appSession(), true);
  }
});
