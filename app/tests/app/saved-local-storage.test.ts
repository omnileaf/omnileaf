import { expect, test } from "vitest";

import { lastSavedValue } from "./saved-local-storage.ts";

const ORIGIN = "_http://tauri.localhost";
const LATIN_1 = 1;
const VALUE_RECORD = 1;
const BATCH_HEADER_BYTES = 12;

function varint(length: number): Buffer {
  const bytes: number[] = [];
  let rest = length;
  while (rest >= 0x80) {
    bytes.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}

function savedItem(key: string, value: string): Buffer {
  const storedKey = Buffer.concat([
    Buffer.from(ORIGIN, "latin1"),
    Buffer.from([0, LATIN_1]),
    Buffer.from(key, "latin1"),
  ]);
  const storedValue = Buffer.concat([
    Buffer.from([LATIN_1]),
    Buffer.from(value, "latin1"),
  ]);
  return Buffer.concat([
    Buffer.alloc(BATCH_HEADER_BYTES),
    Buffer.from([VALUE_RECORD]),
    varint(storedKey.length),
    storedKey,
    varint(storedValue.length),
    storedValue,
  ]);
}

test("reads the value the WebView saved last for a key", () => {
  const log = Buffer.concat([
    savedItem("omnileaf.theme", "system"),
    savedItem("omnileaf.language", "en"),
    savedItem("omnileaf.theme", "light"),
  ]);

  expect(lastSavedValue(log, "omnileaf.theme")).toBe("light");
});

test("reads nothing for a key the WebView never saved", () => {
  const log = savedItem("omnileaf.language", "en");

  expect(lastSavedValue(log, "omnileaf.theme")).toBeUndefined();
});

test("reads nothing from a log that ends in the middle of the value", () => {
  const whole = savedItem("omnileaf.theme", "light");
  const cut = whole.subarray(0, whole.length - 2);

  expect(lastSavedValue(cut, "omnileaf.theme")).toBeUndefined();
});

test("reads a value longer than one length byte holds", () => {
  const long = "x".repeat(300);

  expect(
    lastSavedValue(savedItem("omnileaf.theme", long), "omnileaf.theme"),
  ).toBe(long);
});
