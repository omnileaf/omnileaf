import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { fromIcuFile, type Messages, toIcuFile } from "./message-icu.ts";

const MESSAGES = new URL("../messages/", import.meta.url);
const [direction, locale, directory = "../target/icu"] = process.argv.slice(2);

async function readJson<Value>(path: string | URL): Promise<Value> {
  return JSON.parse(await readFile(path, "utf8")) as Value;
}

if (
  (direction !== "export" && direction !== "import") ||
  locale === undefined
) {
  throw new Error("usage: messages-icu.ts export|import <locale> [directory]");
}

const folder = new URL(`${directory}/`, import.meta.url);
const icuFile = join(folder.pathname, `${locale}.json`);
const sourceMessages = await readJson<Messages>(new URL("en.json", MESSAGES));

if (direction === "export") {
  const messages = await readJson<Messages>(
    new URL(`${locale}.json`, MESSAGES),
  );
  await mkdir(folder, { recursive: true });
  await writeFile(icuFile, `${JSON.stringify(toIcuFile(messages), null, 2)}\n`);
} else {
  const icu = await readJson<Record<string, string>>(icuFile);
  await writeFile(
    new URL(`${locale}.json`, MESSAGES),
    `${JSON.stringify(fromIcuFile(icu, sourceMessages), null, 2)}\n`,
  );
}
