import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestProject } from "vitest/node";

import { launchDesktopApp } from "./desktop-app.ts";
import { createSampleLibrary } from "./sample-library.ts";

const WEBDRIVER_PORT = 4445;

declare module "vitest" {
  interface ProvidedContext {
    libraryHome: string;
  }
}

export async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const library = await createSampleLibrary();
  const dataDir = await mkdtemp(join(tmpdir(), "omnileaf-e2e-data-"));
  const crashReports = await mkdtemp(join(tmpdir(), "omnileaf-e2e-crashes-"));
  const removeFolders = async (): Promise<void> => {
    await rm(dataDir, { recursive: true, force: true });
    await rm(crashReports, { recursive: true, force: true });
    await library.remove();
  };
  const app = await launchDesktopApp({
    webDriverPort: WEBDRIVER_PORT,
    dataDir,
    pickedFolder: library.folder,
    crashReports,
  }).catch(async (error: unknown) => {
    await removeFolders();
    throw error;
  });
  project.provide("libraryHome", dataDir);
  project.provide("appUnderTest", {
    server: app.server.href,
    capabilities: {},
  });
  project.provide("sampleLibraryFolder", library.folder);
  return async () => {
    try {
      await app.stop();
    } finally {
      await removeFolders();
    }
  };
}
