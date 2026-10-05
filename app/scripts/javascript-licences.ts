import { readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

import {
  catalogueOf,
  type LicenceFile,
  packageRootOf,
  type ShippedPackage,
} from "../src/lib/licences/shipped-packages.ts";

export type LicencesMode = "verify" | "write";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CATALOGUE = "src/lib/licences/javascript.json";
const LICENCE_FILE = /^(?:licen[cs]e|copying)(?:[._-]|$)/i;
const SPDX_DOCUMENT = /\.spdx$/i;
const CLIENT_ENVIRONMENT = "client";

/** Packages whose code reaches the bundle without a module import: Tailwind's base styles and Paraglide's generated runtime. */
const EMBEDDED_PACKAGES = ["tailwindcss", "@inlang/paraglide-js"] as const;

function field(manifest: unknown, name: string, root: string): string {
  const value: unknown =
    typeof manifest === "object" && manifest !== null
      ? Reflect.get(manifest, name)
      : undefined;
  if (typeof value !== "string") {
    throw new Error(`read ${root}/package.json: no "${name}" string`);
  }
  return value;
}

async function licenceFiles(root: string): Promise<LicenceFile[]> {
  const names = (await readdir(root)).filter(
    (name) => LICENCE_FILE.test(name) && !SPDX_DOCUMENT.test(name),
  );
  if (names.length === 0) {
    throw new Error(`read the licence of ${root}: no licence file`);
  }
  return Promise.all(
    names.map(async (name) => ({
      name,
      text: await readFile(join(root, name), "utf8"),
    })),
  );
}

async function shippedPackage(root: string): Promise<ShippedPackage> {
  const manifest: unknown = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  return {
    name: field(manifest, "name", root),
    version: field(manifest, "version", root),
    licence: field(manifest, "license", root),
    files: await licenceFiles(root),
  };
}

async function committedCatalogue(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/** Lists the licences of the packages in the app's client bundle, writing the catalogue or failing the build when it is stale. */
export function javascriptLicences(mode: LicencesMode): Plugin {
  return {
    name: "omnileaf:javascript-licences",
    apply: "build",
    applyToEnvironment: (environment) =>
      environment.name === CLIENT_ENVIRONMENT,
    async generateBundle(_options, bundle) {
      const roots = new Set<string>();
      for (const output of Object.values(bundle)) {
        const ids = output.type === "chunk" ? output.moduleIds : [];
        for (const root of ids.map(packageRootOf)) {
          if (root !== undefined) {
            roots.add(await realpath(root));
          }
        }
      }
      for (const name of EMBEDDED_PACKAGES) {
        roots.add(await realpath(join(APP_ROOT, "node_modules", name)));
      }
      const packages = await Promise.all([...roots].map(shippedPackage));
      const generated = `${JSON.stringify(catalogueOf(packages), null, 2)}\n`;
      const path = join(APP_ROOT, CATALOGUE);
      if (mode === "write") {
        await writeFile(path, generated);
        return;
      }
      if ((await committedCatalogue(path)) !== generated) {
        this.error(`${CATALOGUE} is out of date; run \`cargo xtask licences\``);
      }
    },
  };
}
