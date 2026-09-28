import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const SAMPLE_LIBRARY = {
  name: "Sample Library",
  comics: [
    "Sample Series 01.cbz",
    "Sample Series 02.cbr",
    "Specials/Sample Special.cb7",
  ],
  otherFiles: ["notes.txt"],
} as const;

export interface CreatedLibrary {
  readonly folder: string;
  remove(): Promise<void>;
}

export async function createSampleLibrary(): Promise<CreatedLibrary> {
  const parent = await mkdtemp(join(tmpdir(), "omnileaf-e2e-"));
  const folder = join(parent, SAMPLE_LIBRARY.name);
  for (const file of [...SAMPLE_LIBRARY.comics, ...SAMPLE_LIBRARY.otherFiles]) {
    const path = join(folder, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "");
  }
  return {
    folder,
    remove: () => rm(parent, { recursive: true, force: true }),
  };
}
