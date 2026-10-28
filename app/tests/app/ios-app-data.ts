import { execFile } from "node:child_process";
import { cp, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { inject } from "vitest";

import { createSampleLibrary } from "./sample-library.ts";

const SIMCTL_TIMEOUT_MS = 30_000;
const SAMPLE_CHAPTER = join("Sample Series 03", "Chapter 01");

const run = promisify(execFile);

export function capability(name: string): string {
  const value = inject("appUnderTest").capabilities[name];
  if (typeof value !== "string") {
    throw new Error(`the iOS session has no ${name}`);
  }
  return value;
}

export async function appContainer(): Promise<string> {
  const { stdout } = await run(
    "xcrun",
    [
      "simctl",
      "get_app_container",
      capability("appium:udid"),
      capability("appium:bundleId"),
      "data",
    ],
    { timeout: SIMCTL_TIMEOUT_MS },
  );
  return stdout.trim();
}

export async function onMyIphoneOmnileaf(): Promise<string> {
  return join(await appContainer(), "Documents");
}

export async function copyNewBookInto(
  folder: string,
  series: string,
): Promise<void> {
  const sample = await createSampleLibrary();
  try {
    const chapter = join(sample.folder, SAMPLE_CHAPTER);
    const pages = (await readdir(chapter)).toSorted().slice(0, -1);
    const copied = join(folder, series, "Chapter 01");
    await mkdir(copied, { recursive: true });
    for (const page of pages) {
      await cp(join(chapter, page), join(copied, page));
    }
  } finally {
    await sample.remove();
  }
}
