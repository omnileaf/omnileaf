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
