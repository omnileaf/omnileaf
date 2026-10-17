import type { Platform } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { onPlatform } from "./fixtures.ts";

type WireFolder = Awaited<
  ReturnType<FakeBackend["libraryFolders"]>
>["folders"][number];

const SIMULATOR_HOME =
  "/Users/reader/Library/Developer/CoreSimulator/Devices/2A6F0C3E-8B1D-4E7A-9C52-1F3B7D9E4A60/data/Containers/Data/Application/5D2E8F1A-3C4B-4A6E-B7D9-0E1F2A3B4C5D/Documents";
export const LONG_FOLDER_NAME =
  "Comics-and-manga-gathered-over-many-years-from-every-shelf-in-the-house";

const LONG_FOLDERS: readonly WireFolder[] = [
  {
    id: "1",
    kind: "home",
    name: "Documents",
    location: SIMULATOR_HOME,
    isAvailable: true,
  },
  {
    id: "2",
    kind: "linked",
    name: LONG_FOLDER_NAME,
    location: `${SIMULATOR_HOME}/${LONG_FOLDER_NAME}`,
    isAvailable: true,
  },
];

export function longFoldersOn(platform: Platform): FakeBackend {
  return {
    ...onPlatform(platform).backend,
    libraryFolders: () => ({ folders: [...LONG_FOLDERS], next: null }),
    rescanLibraryFolder: (id) => ({
      id,
      name: LONG_FOLDER_NAME,
      outcome: { kind: "foundEmpty" },
    }),
  };
}
