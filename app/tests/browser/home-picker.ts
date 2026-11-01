import type { Locator, Page } from "@playwright/test";

import type { ChosenHomeFolder } from "../../src/lib/ipc/bindings.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import { expect, onPlatform } from "./fixtures.ts";

type WireFolder = Awaited<
  ReturnType<FakeBackend["libraryFolders"]>
>["folders"][number];

export const APP_STORAGE_HOME: WireFolder = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "Internal storage › Android › data › app.omnileaf › files",
  isAvailable: true,
};
export const PICKED_LOCATION = "Internal storage › Comics";
export const LONG_PICKED_LOCATION =
  "SD card › Backups › Reading › Omnileaf library (moved from the old phone) › Sample Comics From A Drive With A Long Name";
const MOVED_HOME: WireFolder = {
  ...APP_STORAGE_HOME,
  name: "Comics",
  location: PICKED_LOCATION,
};
const OLD_HOME_KEPT: WireFolder = {
  id: "2",
  kind: "linked",
  name: "Omnileaf",
  location: APP_STORAGE_HOME.location,
  isAvailable: true,
};
export const HOME_ROW = "Home folder";
export const FOUND_WHILE_READING = 38;

export class HomePicker {
  picks: (ChosenHomeFolder | CommandFailure | null)[] = [];
  chooses = 0;
  pickedLocation = PICKED_LOCATION;
  moves = 0;
  rescans: string[] = [];
  hasMoved = false;
  keepsOldHome = false;
  failsToRescan = false;
  isFirstLaunch = false;
  answering: Promise<void> = Promise.resolve();
  reading: Promise<void> = Promise.resolve();

  reset(): void {
    this.picks = [];
    this.chooses = 0;
    this.pickedLocation = PICKED_LOCATION;
    this.moves = 0;
    this.rescans = [];
    this.hasMoved = false;
    this.keepsOldHome = false;
    this.failsToRescan = false;
    this.isFirstLaunch = false;
    this.answering = Promise.resolve();
    this.reading = Promise.resolve();
  }

  holdRescan(): () => void {
    let release = () => {};
    this.reading = new Promise((resolve) => {
      release = resolve;
    });
    return release;
  }

  holdMove(): () => void {
    let release = () => {};
    this.answering = new Promise((resolve) => {
      release = resolve;
    });
    return release;
  }

  pickEmpty(location = PICKED_LOCATION): void {
    this.picks.push({ location, choice: { kind: "empty" } });
  }

  pickUnreadable(): void {
    this.picks.push(
      new CommandFailure({
        code: "folderUnreadable",
        message: "the folder can't be listed",
      }),
    );
  }

  folders(): WireFolder[] {
    const home = this.hasMoved
      ? { ...MOVED_HOME, location: this.pickedLocation }
      : APP_STORAGE_HOME;
    return this.hasMoved && this.keepsOldHome ? [home, OLD_HOME_KEPT] : [home];
  }
}

export const picker = new HomePicker();

export function pickingAHome(): FakeBackend {
  return {
    ...onPlatform("android").backend,
    firstLaunchFinished: () => !picker.isFirstLaunch,
    libraryFolders: () => ({ folders: picker.folders(), next: null }),
    libraryFolderBookCount: () => 12,
    chooseHomeFolder: () => {
      picker.chooses += 1;
      const pick = picker.picks.shift() ?? null;
      if (pick instanceof CommandFailure) {
        throw pick;
      }
      if (pick !== null) {
        picker.pickedLocation = pick.location;
      }
      return pick;
    },
    moveHomeFolder: async () => {
      picker.moves += 1;
      await picker.answering;
      picker.hasMoved = true;
      return { kind: "moved", folder: APP_STORAGE_HOME.id };
    },
    rescanLibraryFolder: async (id, onProgress) => {
      picker.rescans.push(id);
      await onProgress.send({ stage: "finding", found: FOUND_WHILE_READING });
      await picker.reading;
      if (picker.failsToRescan) {
        throw new CommandFailure({
          code: "internal",
          message: "the folder couldn't be read",
        });
      }
      return {
        id,
        name: MOVED_HOME.name,
        outcome: {
          kind: "rescanned",
          added: 12,
          updated: 0,
          moved: 0,
          removed: 0,
          unreadableBooks: 0,
          unsupportedBooks: 0,
          unreadableFolders: 0,
        },
      };
    },
  };
}

export function homeRow(page: Page): Locator {
  return page
    .getByRole("region", { name: HOME_ROW })
    .getByRole("button", { name: HOME_ROW, exact: true });
}

export async function goToTheHomeStep(page: Page): Promise<void> {
  await page.goto("/first-launch");
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Where your library lives" }),
  ).toBeVisible();
}
