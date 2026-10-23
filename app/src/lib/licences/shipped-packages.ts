import type { LicenceCatalogue, LicenceText } from "./catalogue.ts";
import { byCodePoint } from "./order.ts";

export interface LicenceFile {
  readonly name: string;
  readonly text: string;
}

export interface ShippedPackage {
  readonly name: string;
  readonly version: string;
  readonly licence: string;
  readonly files: readonly LicenceFile[];
}

/** Licences granted by a package's licence file but missing from its manifest, by name and version so an upgrade is checked again. */
const UNDECLARED_LICENCES: ReadonlyMap<string, string> = new Map([
  ["svelte-toolbelt@0.10.6", "MIT"],
]);

/** Code ported into the app from a package, kept in a folder beside that package's licence file. */
export interface PortedCode {
  readonly name: string;
  readonly version: string;
  readonly licence: string;
  readonly folder: string;
}

export const PORTED_CODE: readonly PortedCode[] = [
  {
    name: "vaul-svelte",
    version: "1.0.0-next.7",
    licence: "MIT",
    folder: "src/lib/components/ui/drawer",
  },
  {
    name: "framework7-icons",
    version: "5.0.5",
    licence: "MIT",
    folder: "src/lib/icons/framework7",
  },
  {
    name: "@material-symbols/svg-400",
    version: "0.48.0",
    licence: "Apache-2.0",
    folder: "src/lib/icons/material-symbols",
  },
  {
    name: "lucide-static",
    version: "1.58.0",
    licence: "ISC",
    folder: "src/lib/icons/lucide",
  },
];

const NODE_MODULES = "/node_modules/";
const SCOPE_PREFIX = "@";
const VIRTUAL_PREFIX = "\0";

/** The folder of the installed package a bundled module belongs to, or `undefined` for the app's own modules. */
export function packageRootOf(moduleId: string): string | undefined {
  const [file = ""] = moduleId.split("?");
  const start = file.lastIndexOf(NODE_MODULES);
  if (file.startsWith(VIRTUAL_PREFIX) || start === -1) {
    return undefined;
  }
  const inside = file.slice(start + NODE_MODULES.length).split("/");
  const nameLength = inside[0]?.startsWith(SCOPE_PREFIX) ? 2 : 1;
  return [
    file.slice(0, start),
    "node_modules",
    ...inside.slice(0, nameLength),
  ].join("/");
}

function withForwardSlashes(path: string): string {
  return path.replaceAll("\\", "/");
}

export type BundleOutput =
  | { readonly type: "chunk"; readonly moduleIds: readonly string[] }
  | { readonly type: "asset"; readonly originalFileNames: readonly string[] };

export function shippedFilesOf(
  outputs: readonly BundleOutput[],
  appRoot: string,
): readonly string[] {
  const root = withForwardSlashes(appRoot).replace(/\/+$/u, "");
  return outputs.flatMap((output) =>
    output.type === "chunk"
      ? output.moduleIds
      : output.originalFileNames.map(
          (name) => `${root}/${withForwardSlashes(name)}`,
        ),
  );
}

/** Matches paths of either separator, since Node names the folder with backslashes on Windows while Vite names modules with slashes. */
export function isFolderShipped(
  folder: string,
  shippedFiles: readonly string[],
): boolean {
  const inside = `${withForwardSlashes(folder)}/`;
  return shippedFiles.some((file) =>
    withForwardSlashes(file).startsWith(inside),
  );
}

/** The licence a package's manifest declares, else the one it is known to ship without declaring. */
export function licenceOf(
  name: string,
  version: string,
  declared: unknown,
): string | undefined {
  return typeof declared === "string"
    ? declared
    : UNDECLARED_LICENCES.get(`${name}@${version}`);
}

function byNameThenVersion(a: ShippedPackage, b: ShippedPackage): number {
  return byCodePoint(a.name, b.name) || byCodePoint(a.version, b.version);
}

function textsOf(shipped: ShippedPackage): LicenceText[] {
  const files = shipped.files.toSorted((a, b) => byCodePoint(a.name, b.name));
  return files.map((file) => ({
    licence: files.length === 1 ? shipped.licence : file.name,
    text: file.text.replaceAll("\r\n", "\n"),
  }));
}

export function catalogueOf(
  packages: readonly ShippedPackage[],
): LicenceCatalogue {
  const texts: LicenceText[] = [];
  const indexOf = (licence: LicenceText): number => {
    const known = texts.findIndex(({ text }) => text === licence.text);
    return known === -1 ? texts.push(licence) - 1 : known;
  };
  return {
    packages: packages.toSorted(byNameThenVersion).map((shipped) => ({
      name: shipped.name,
      version: shipped.version,
      licence: shipped.licence,
      texts: textsOf(shipped).map(indexOf),
    })),
    texts,
  };
}
