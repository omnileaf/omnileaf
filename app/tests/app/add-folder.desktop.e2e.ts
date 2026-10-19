import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, onTestFinished, test } from "vitest";

import {
  FINISHED_SCAN_REPORT,
  mainNavigationLink,
  openLibraryPage,
  useAppSession,
} from "./app-session.ts";
import { SAMPLE_LIBRARY } from "./sample-library.ts";
import { segmentedOption } from "./segmented-control.ts";
import { xpath } from "./webdriver.ts";

const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
const SETTINGS_LINK = mainNavigationLink("Settings");
const LIBRARY_SETTINGS_LINK = xpath("//main//a[@href='/settings/library']");
const LINKED_FOLDER_NAMES = xpath(
  "//section[.//h2[normalize-space()='Folders']]//li//*[@data-slot='item-title']",
);
const REMOVE_SAMPLE_LIBRARY = xpath(
  `//button[@aria-label='Remove ${SAMPLE_LIBRARY.name}']`,
);
const DISMISS_REMOVAL_UNDO = xpath(
  `//li[@data-sonner-toast][.//p[normalize-space()='${SAMPLE_LIBRARY.name} removed']]//button[@aria-label='Dismiss']`,
);
const FOLDERS_WITHOUT_LINKED_FOLDERS = xpath(
  "//section[.//h2[normalize-space()='Folders']][not(.//li)]",
);
const FOLDERS_SECTION = xpath("//section[.//h2[normalize-space()='Folders']]");
const RESCAN_SAMPLE_LIBRARY = xpath(
  `//button[@aria-label='Rescan ${SAMPLE_LIBRARY.name}']`,
);
const UP_TO_DATE_REPORT = xpath(
  `//*[@role='status']/p[normalize-space()='${SAMPLE_LIBRARY.name} is up to date.']`,
);
const LOADED_HOME_FOLDER = xpath(
  "//section[.//h2[normalize-space()='Home folder']]//button[@aria-label='Rescan Omnileaf']",
);

const VIEW_OPTIONS_BUTTON = xpath("//button[@aria-label='View options']");
const LIST_CHOICE = segmentedOption(
  "//*[@role='dialog'][@data-state='open']",
  "List",
);
const SERIES_IN_ONE_COLUMN = `const series = document.querySelector("ul[aria-label='Series']");
return series !== null && series.children.length > 0 && getComputedStyle(series).gridTemplateColumns.split(" ").length === 1;`;

const EVERY_COVER_SHOWN = `const covers = [...document.querySelectorAll("ul[aria-label='Series'] img")];
return covers.length === ${String(SAMPLE_LIBRARY.series)} && covers.every((cover) => cover.complete && cover.naturalWidth > 0);`;

const FIRST_COVER = `return document.querySelector("ul[aria-label='Series'] img")?.src ?? null;`;

const COVER_ON_PAGE_SHOWN = `const cover = document.querySelector("img");
return cover !== null && cover.complete && cover.naturalWidth > 0;`;

const SCAN_REPORT = `Added ${String(SAMPLE_LIBRARY.books)} books from ${SAMPLE_LIBRARY.name}`;

const appSession = useAppSession();

async function openLibrarySettings(): Promise<void> {
  await openLibraryPage(appSession());
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(LIBRARY_SETTINGS_LINK)).click();
}

test("adds a folder, waits for its scan and reports the series and books in it", async () => {
  await openLibrarySettings();
  const button = await appSession().waitFor(ADD_FOLDER_BUTTON);

  await button.click();

  const report = await appSession().waitFor(FINISHED_SCAN_REPORT);
  expect(await report.text()).toBe(SCAN_REPORT);
});

test("shows the cover of every series it found, read through the app's own protocol", async () => {
  await openLibrarySettings();
  await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
  await appSession().waitFor(FINISHED_SCAN_REPORT);
  await openLibraryPage(appSession());

  const shown = appSession().waitUntil(
    EVERY_COVER_SHOWN,
    "a loaded cover for every series",
  );

  await expect(shown).resolves.toBeUndefined();
});

async function servePageShowing(cover: string): Promise<URL> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><img alt="" src="${cover}">`);
  });
  await new Promise<void>((listening) => {
    server.listen(0, "127.0.0.1", listening);
  });
  onTestFinished(() => {
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  return new URL(`http://127.0.0.1:${String(port)}/`);
}

test.runIf(process.platform === "linux")(
  "shows a cover to a page served over http, as the dev server serves the app's",
  async () => {
    await openLibrarySettings();
    await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
    await appSession().waitFor(FINISHED_SCAN_REPORT);
    await openLibraryPage(appSession());
    await appSession().waitUntil(
      EVERY_COVER_SHOWN,
      "a loaded cover for every series",
    );
    const cover = String(await appSession().run(FIRST_COVER));
    const page = await servePageShowing(cover);
    onTestFinished(async () => {
      await appSession().run("setTimeout(() => history.back()); return null;");
    });

    await appSession().run(
      `setTimeout(() => location.assign(${JSON.stringify(page.href)})); return null;`,
    );

    const shown = appSession().waitUntil(
      `return location.origin === ${JSON.stringify(page.origin)} && (() => { ${COVER_ON_PAGE_SHOWN} })();`,
      "the cover on the page served over http",
    );
    await expect(shown).resolves.toBeUndefined();
  },
);

test("adds a folder from Settings › Library and lists it there", async () => {
  await openLibrarySettings();
  const button = await appSession().waitFor(ADD_FOLDER_BUTTON);

  await button.click();

  const report = await appSession().waitFor(FINISHED_SCAN_REPORT);
  expect(await report.text()).toBe(SCAN_REPORT);
  const listed = await appSession().waitFor(LINKED_FOLDER_NAMES);
  expect(await listed.text()).toBe(SAMPLE_LIBRARY.name);
});

test("removes a folder from Settings › Library once its Undo is dismissed", async () => {
  await openLibrarySettings();
  await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
  await (await appSession().waitFor(REMOVE_SAMPLE_LIBRARY)).click();

  await (await appSession().waitFor(DISMISS_REMOVAL_UNDO)).click();

  await appSession().waitFor(FOLDERS_WITHOUT_LINKED_FOLDERS);
  await openLibrarySettings();
  await appSession().waitFor(LOADED_HOME_FOLDER);
  const folders = await appSession().waitFor(FOLDERS_SECTION);
  expect(await folders.text()).not.toContain(SAMPLE_LIBRARY.name);
});

test("rescans a folder from Settings › Library and finds nothing changed", async () => {
  await openLibrarySettings();
  await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
  await appSession().waitFor(FINISHED_SCAN_REPORT);

  await (await appSession().waitFor(RESCAN_SAMPLE_LIBRARY)).click();

  const report = await appSession().waitFor(UP_TO_DATE_REPORT);
  expect(await report.text()).toBe(`${SAMPLE_LIBRARY.name} is up to date.`);
});

test("draws the library as the list chosen in its view options after the app reloads", async () => {
  await openLibrarySettings();
  await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
  await appSession().waitFor(FINISHED_SCAN_REPORT);
  await openLibraryPage(appSession());
  await (await appSession().waitFor(VIEW_OPTIONS_BUTTON)).click();
  await (await appSession().waitFor(LIST_CHOICE)).click();
  await appSession().waitUntil(SERIES_IN_ONE_COLUMN, "the series in a list");

  await appSession().reload();

  const listed = appSession().waitUntil(
    SERIES_IN_ONE_COLUMN,
    "the series in a list once the app reloaded",
  );
  await expect(listed).resolves.toBeUndefined();
});
