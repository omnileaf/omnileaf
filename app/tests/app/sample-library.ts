import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** The generated sample library that `cargo xtask fixtures` writes. */
export const SAMPLE_LIBRARY = {
  name: "Sample Library",
  series: 3,
  books: 7,
} as const;

const WORKSPACE = fileURLToPath(new URL("../../../", import.meta.url));

export interface CreatedLibrary {
  readonly folder: string;
  remove(): Promise<void>;
}

export async function createSampleLibrary(): Promise<CreatedLibrary> {
  const parent = await mkdtemp(join(tmpdir(), "omnileaf-e2e-"));
  const remove = (): Promise<void> =>
    rm(parent, { recursive: true, force: true });
  try {
    await promisify(execFile)("cargo", ["xtask", "fixtures", "--out", parent], {
      cwd: WORKSPACE,
    });
  } catch (error) {
    await remove();
    throw error;
  }
  return { folder: join(parent, SAMPLE_LIBRARY.name), remove };
}
