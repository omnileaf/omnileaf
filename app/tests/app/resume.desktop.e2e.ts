import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, expect, inject, test } from "vitest";

import { type DesktopApp, launchDesktopApp } from "./desktop-app.ts";
import { finishFirstLaunchIfShown } from "./first-launch.ts";
import { Session, xpath } from "./webdriver.ts";

/** Clear of the port the shared app's WebDriver server listens on, since both apps run at once. */
const RELAUNCHED_WEBDRIVER_PORT = 4446;
const LAUNCH_TIMEOUT_MS = 120_000;
const RESUME_TIMEOUT_MS = 180_000;
const SAVE_TIMEOUT_MS = 10_000;
const PAGE_READ_TO = 3;

const LIBRARY_LINK = xpath("//nav//a[normalize-space()='Library']");
const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
const FINISHED_SCAN_REPORT = xpath(
  "//*[@role='status'][starts-with(normalize-space(), 'Found ')]",
);
const FIRST_SERIES_COVER = xpath(
  "//ul[@aria-label='Series']//a[.//*[normalize-space()='Sample Series 01']]",
);
const SERIES_HEADING = xpath("//h1[normalize-space()='Sample Series 01']");
const FIRST_BOOK_LINK = xpath(
  "//ul[@aria-label='Books']/li[1]//a[starts-with(normalize-space(), 'Sample Series 01 v01')]",
);
const NEXT_PAGE = xpath("//button[@aria-label='Next page']");

let dataDir: string | undefined;
let crashReports: string | undefined;
let app: DesktopApp | undefined;
let session: Session | undefined;

/** Whether the page is shown, its image loaded from the omni protocol and decoded. */
function pageShownScript(page: number): string {
  return `return [...document.images].some((image) => image.alt === "Page ${String(page)}" && image.complete && image.naturalWidth > 0 && !image.classList.contains("invisible") && image.getAttribute("aria-hidden") === null);`;
}

/** Whether the core holds the first book of the series as read up to `page`, asked through the app's own commands. */
function pageSavedScript(series: string, page: number): string {
  return `return window.__TAURI_INTERNALS__.invoke("series_books", { id: ${JSON.stringify(series)}, listing: { shown: "all", direction: "ascending" }, after: null }).then((books) => books.books[0]?.reading?.page === ${String(page)}, () => false);`;
}

function current(): Session {
  if (session === undefined) {
    throw new Error("the WebDriver session did not start");
  }
  return session;
}

/** Launches the app on its own data folder, which a launch after a kill finds again, and opens a session past the first launch. */
async function launch(): Promise<void> {
  if (dataDir === undefined || crashReports === undefined) {
    throw new Error("the data folders were not made");
  }
  app = await launchDesktopApp({
    port: RELAUNCHED_WEBDRIVER_PORT,
    dataDir,
    pickedFolder: inject("sampleLibraryFolder"),
    crashReports,
  });
  session = await Session.start(app.server, {});
  await finishFirstLaunchIfShown(session);
  await (await session.waitFor(LIBRARY_LINK)).click();
}

/** Opens the first series' page, returning the series' id from its address. */
async function openFirstSeries(): Promise<string> {
  await (await current().waitFor(FIRST_SERIES_COVER)).click();
  await current().waitFor(SERIES_HEADING);
  const series = new URL(await current().url()).pathname.split("/").at(-1);
  if (series === undefined || series === "") {
    throw new Error("the series page's address names no series");
  }
  return series;
}

async function openFirstBook(): Promise<void> {
  await (await current().waitFor(FIRST_BOOK_LINK)).click();
  await current().waitFor(NEXT_PAGE);
}

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "omnileaf-e2e-resume-"));
  crashReports = await mkdtemp(join(tmpdir(), "omnileaf-e2e-resume-crashes-"));
  await launch();
}, LAUNCH_TIMEOUT_MS);

afterAll(async () => {
  try {
    await app?.stop();
  } finally {
    for (const folder of [dataDir, crashReports]) {
      if (folder !== undefined) {
        await rm(folder, { recursive: true, force: true });
      }
    }
  }
}, LAUNCH_TIMEOUT_MS);

test(
  "opens a book on the page it was on when the app was killed",
  async () => {
    await (await current().waitFor(ADD_FOLDER_BUTTON)).click();
    await current().waitFor(FINISHED_SCAN_REPORT);
    const series = await openFirstSeries();
    await openFirstBook();
    await current().waitUntil(pageShownScript(1), "the first page shown");
    for (let page = 2; page <= PAGE_READ_TO; page += 1) {
      await (await current().waitFor(NEXT_PAGE)).click();
      await current().waitUntil(
        pageShownScript(page),
        `page ${String(page)} shown`,
      );
    }
    await current().waitUntil(
      pageSavedScript(series, PAGE_READ_TO),
      `page ${String(PAGE_READ_TO)} saved`,
      SAVE_TIMEOUT_MS,
    );

    await app?.kill();
    await launch();
    await openFirstSeries();
    await openFirstBook();

    await current().waitUntil(
      pageShownScript(PAGE_READ_TO),
      `page ${String(PAGE_READ_TO)} shown again`,
    );
    const line = await current().waitFor(
      xpath(
        `//header//p[contains(normalize-space(), 'Page ${String(PAGE_READ_TO)} of 8')]`,
      ),
    );
    expect(await line.text()).toBe("Sample Series 01 v01 · Page 3 of 8");
  },
  RESUME_TIMEOUT_MS,
);
