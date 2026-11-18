import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { pollUntil } from "./webdriver.ts";

const APP_ID = "app.omnileaf";
const SAVED_LOCAL_STORAGE = "app_webview/Default/Local Storage/leveldb";
const ADB_TIMEOUT_MS = 30_000;
const ADB_OUTPUT_MAX_BYTES = 16 * 1024 * 1024;
const KEY_START = Buffer.from([0, 1]);
const LATIN_1 = 1;
const VARINT_MORE = 0x80;
const VARINT_BITS = 0x7f;
const VARINT_SHIFT = 7;

interface Varint {
  readonly value: number;
  readonly end: number;
}

function varintAt(bytes: Buffer, start: number): Varint | undefined {
  let value = 0;
  let shift = 0;
  for (let at = start; at < bytes.length; at += 1) {
    const byte = bytes[at] ?? 0;
    value |= (byte & VARINT_BITS) << shift;
    if ((byte & VARINT_MORE) === 0) {
      return { value, end: at + 1 };
    }
    shift += VARINT_SHIFT;
  }
  return undefined;
}

const run = promisify(execFile);

/** Chromium saves each localStorage item in its LevelDB log as the origin, a 0 byte, an encoding byte and the key, then the value behind its own encoding byte. */
export function lastSavedValue(log: Buffer, key: string): string | undefined {
  const storedKey = Buffer.concat([KEY_START, Buffer.from(key, "latin1")]);
  const found = log.lastIndexOf(storedKey);
  if (found < 0) {
    return undefined;
  }
  const length = varintAt(log, found + storedKey.length);
  if (length === undefined || length.end + length.value > log.length) {
    return undefined;
  }
  const value = log.subarray(length.end, length.end + length.value);
  return value[0] === LATIN_1
    ? value.subarray(1).toString("latin1")
    : value.subarray(1).toString("utf16le");
}

async function savedOnThePhone(key: string): Promise<string | undefined> {
  const { stdout } = await run(
    "adb",
    [
      "exec-out",
      "run-as",
      APP_ID,
      "sh",
      "-c",
      `cat '${SAVED_LOCAL_STORAGE}'/*.log`,
    ],
    {
      timeout: ADB_TIMEOUT_MS,
      maxBuffer: ADB_OUTPUT_MAX_BYTES,
      encoding: "buffer",
    },
  );
  return lastSavedValue(stdout, key);
}

/** Android's WebView writes localStorage to disk about a second after the page sets it, so stopping the app sooner loses the change. */
export async function waitUntilSavedOnThePhone(
  key: string,
  isWanted: (saved: string | undefined) => boolean,
  what: string,
): Promise<void> {
  await pollUntil(
    async () => (isWanted(await savedOnThePhone(key)) ? true : undefined),
    ADB_TIMEOUT_MS,
    what,
  );
}
