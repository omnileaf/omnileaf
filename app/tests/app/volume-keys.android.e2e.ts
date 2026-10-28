import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, expect, onTestFinished, test } from "vitest";

import {
  mainNavigationLink,
  openLibraryPage,
  useAppSession,
} from "./app-session.ts";
import {
  addSampleLibraryFromFiles,
  putSampleLibraryOnTheDevice,
  removeSampleLibraryFromTheDevice,
} from "./files-sample-library.ts";
import { pageShownScript } from "./page-shown.ts";
import { FIRST_SERIES_COVER } from "./sample-book.ts";
import { type Locator, xpath } from "./webdriver.ts";

const BACK_KEY = 4;
const VOLUME_UP_KEY = 24;
const VOLUME_DOWN_KEY = 25;
const MUSIC_STREAM = "3";
const ADB_TIMEOUT_MS = 30_000;
const LOOK_ONCE_MS = 0;
const SETUP_TIMEOUT_MS = 180_000;
const PAGE_TURN_TIMEOUT_MS = 10_000;
const AUDIO_ANSWER = /-> (\d+)/;
const MEDIA_SESSION_ANSWER = /volume is (\d+) in range \[(\d+)\.\.(\d+)\]/;

const READER_SETTINGS_LINK = xpath("//main//a[@href='/settings/reading']");
const VOLUME_KEYS_SWITCH =
  "//main//*[@role='switch'][.//*[normalize-space()='Turn pages with the volume keys']]";
const SERIES_HEADING = xpath(
  "//main//h1[normalize-space()='Sample Series 01']",
);
const FIRST_BOOK_LINK = xpath(
  "//ul[@aria-label='Books']/li[1]//a[starts-with(@href, '/read/')]",
);
const SCROLL_TO_THE_BOOKS = `const books = document.querySelector("ul[aria-label='Books']");
if (books === null) { return false; }
books.scrollIntoView({ block: "start" });
return true;`;
const OUT_OF_THE_READER = "return !location.pathname.startsWith('/read/');";

const run = promisify(execFile);

type VolumeCommands = "audio" | "media session";

interface MusicVolume {
  level: number;
  lowest: number;
  highest: number;
  readThrough: VolumeCommands;
}

const appSession = useAppSession();

beforeAll(async () => {
  await putSampleLibraryOnTheDevice();
  await addSampleLibraryFromFiles(appSession());
}, SETUP_TIMEOUT_MS);

afterAll(removeSampleLibraryFromTheDevice);

async function adbShell(...args: string[]): Promise<string> {
  const { stdout } = await run("adb", ["shell", ...args], {
    timeout: ADB_TIMEOUT_MS,
  });
  return stdout;
}

async function askAudio(...args: string[]): Promise<number | undefined> {
  const answer = await adbShell("cmd", "audio", ...args, MUSIC_STREAM);
  const found = AUDIO_ANSWER.exec(answer);
  return found === null ? undefined : Number(found[1]);
}

async function askMediaSession(): Promise<MusicVolume> {
  const answer = await adbShell(
    "cmd",
    "media_session",
    "volume",
    "--stream",
    MUSIC_STREAM,
    "--get",
  );
  const found = MEDIA_SESSION_ANSWER.exec(answer);
  if (found === null) {
    throw new Error(`read the music volume from: ${answer}`);
  }
  return {
    level: Number(found[1]),
    lowest: Number(found[2]),
    highest: Number(found[3]),
    readThrough: "media session",
  };
}

/** Asks `cmd audio` first, since Android 16 ignores `cmd media_session volume --set`, and falls back to `media_session` on Android versions without the `cmd audio` volume commands. */
async function musicVolume(): Promise<MusicVolume> {
  const level = await askAudio("get-stream-volume");
  if (level === undefined) {
    return askMediaSession();
  }
  const lowest = await askAudio("get-min-volume");
  const highest = await askAudio("get-max-volume");
  if (lowest === undefined || highest === undefined) {
    throw new Error("read the music volume range from cmd audio");
  }
  return { level, lowest, highest, readThrough: "audio" };
}

async function musicLevel(): Promise<number> {
  return (await musicVolume()).level;
}

async function setMusicVolume(
  level: number,
  through: VolumeCommands,
): Promise<void> {
  await (through === "audio"
    ? adbShell("cmd", "audio", "set-volume", MUSIC_STREAM, String(level))
    : adbShell(
        "cmd",
        "media_session",
        "volume",
        "--stream",
        MUSIC_STREAM,
        "--set",
        String(level),
      ));
}

/** Starts from the middle of the music stream's range, since volume down at its lowest level changes nothing. */
async function startFromMiddleVolume(): Promise<number> {
  const before = await musicVolume();
  onTestFinished(() => setMusicVolume(before.level, before.readThrough));
  const middle = Math.round((before.lowest + before.highest) / 2);
  await setMusicVolume(middle, before.readThrough);
  return middle;
}

/** Presses twice, since Android can spend a press made while its volume panel is hidden on only showing the panel. */
async function turnTheVolumeDown(): Promise<void> {
  await pressKey(VOLUME_DOWN_KEY);
  await pressKey(VOLUME_DOWN_KEY);
}

async function pressKey(keycode: number): Promise<void> {
  await appSession().runMobileCommand("pressKey", { keycode });
}

function volumeKeysSwitch(isOn: boolean): Locator {
  return xpath(`${VOLUME_KEYS_SWITCH}[@aria-checked='${String(isOn)}']`);
}

async function turnPagesWithVolumeKeys(isOn: boolean): Promise<void> {
  const session = appSession();
  await (await session.waitFor(mainNavigationLink("Settings"))).click();
  await (await session.waitFor(READER_SETTINGS_LINK)).click();
  await session.waitFor(xpath(VOLUME_KEYS_SWITCH));
  const toChange = await session.findWithin(
    volumeKeysSwitch(!isOn),
    LOOK_ONCE_MS,
  );
  await toChange?.click();
  await session.waitFor(volumeKeysSwitch(isOn));
  await openLibraryPage(session);
}

async function openFirstBook(): Promise<void> {
  const session = appSession();
  await (await session.waitFor(FIRST_SERIES_COVER)).click();
  await session.waitFor(SERIES_HEADING);
  await session.waitUntil(SCROLL_TO_THE_BOOKS, "the books list in view");
  await (await session.waitFor(FIRST_BOOK_LINK)).click();
  await session.waitUntil(pageShownScript(1), "the first page shown");
}

async function goUpToTheLibrary(): Promise<void> {
  const session = appSession();
  await pressKey(BACK_KEY);
  await session.waitUntil(OUT_OF_THE_READER, "the reader left");
  await openLibraryPage(session);
}

test("turns the page with volume down and back with volume up", async () => {
  await turnPagesWithVolumeKeys(true);
  await openFirstBook();
  onTestFinished(goUpToTheLibrary);

  await pressKey(VOLUME_DOWN_KEY);
  await appSession().waitUntil(pageShownScript(2), "the second page shown");
  await pressKey(VOLUME_UP_KEY);

  await expect
    .poll(() => appSession().run(pageShownScript(1)), {
      timeout: PAGE_TURN_TIMEOUT_MS,
    })
    .toBe(true);
});

test("changes the volume outside the reader", async () => {
  await turnPagesWithVolumeKeys(true);
  await openFirstBook();
  await goUpToTheLibrary();
  const middle = await startFromMiddleVolume();

  await turnTheVolumeDown();

  await expect.poll(musicLevel).toBeLessThan(middle);
});

test("leaves the page alone with the setting off", async () => {
  await turnPagesWithVolumeKeys(false);
  await openFirstBook();
  onTestFinished(goUpToTheLibrary);
  const middle = await startFromMiddleVolume();

  await turnTheVolumeDown();

  await expect.poll(musicLevel).toBeLessThan(middle);
  expect(await appSession().run(pageShownScript(1))).toBe(true);
});
