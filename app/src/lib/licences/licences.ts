import type {
  CataloguedPackage,
  LicenceCatalogue,
  LicenceText,
} from "./catalogue.ts";

export type Ecosystem = "rust" | "javascript";

export interface LicensedPackage {
  readonly key: string;
  readonly name: string;
  readonly version: string;
  readonly licence: string;
  readonly texts: readonly LicenceText[];
}

export interface LicenceGroup {
  readonly name: string;
  readonly packages: readonly LicensedPackage[];
}

const ECOSYSTEMS: readonly Ecosystem[] = ["rust", "javascript"];
const OPERATORS = [" OR ", " AND "] as const;
const LEGACY_OR = "/";
const SPACES = /\s+/g;

function textsOf(
  catalogued: CataloguedPackage,
  catalogue: LicenceCatalogue,
): LicenceText[] {
  return catalogued.texts.map((index) => {
    const text = catalogue.texts[index];
    if (text === undefined) {
      throw new Error(
        `read the licences of ${catalogued.name} ${catalogued.version}: no text ${String(index)}`,
      );
    }
    return text;
  });
}

export function licensedPackages(
  catalogues: Readonly<Record<Ecosystem, LicenceCatalogue>>,
): LicensedPackage[] {
  return ECOSYSTEMS.flatMap((ecosystem) => {
    const catalogue = catalogues[ecosystem];
    return catalogue.packages.map((catalogued) => ({
      key: `${ecosystem}/${catalogued.name}@${catalogued.version}`,
      name: catalogued.name,
      version: catalogued.version,
      licence: catalogued.licence,
      texts: textsOf(catalogued, catalogue),
    }));
  });
}

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : Number(a > b);
}

function withoutOuterParentheses(expression: string): string {
  const inner = expression.slice(1, -1);
  const isWrapped =
    expression.startsWith("(") &&
    expression.endsWith(")") &&
    !inner.includes("(");
  return isWrapped ? inner : expression;
}

/** Writes a licence expression one way, so `MIT OR Apache-2.0` and `(Apache-2.0 OR MIT)` group together. */
export function licenceGroupName(expression: string): string {
  const written = withoutOuterParentheses(
    expression.trim().replaceAll(SPACES, " ").replaceAll(LEGACY_OR, " OR "),
  );
  const used = OPERATORS.filter((operator) => written.includes(operator));
  const [operator] = used;
  if (written.includes("(") || used.length !== 1 || operator === undefined) {
    return written;
  }
  return written.split(operator).toSorted(byCodePoint).join(operator);
}

/** Groups packages by licence, the most used licence first, each group's packages in the collator's order. */
export function groupByLicence(
  packages: readonly LicensedPackage[],
  collator: Intl.Collator,
): LicenceGroup[] {
  const byLicence = new Map<string, LicensedPackage[]>();
  for (const licensed of packages) {
    const name = licenceGroupName(licensed.licence);
    const members = byLicence.get(name);
    if (members === undefined) {
      byLicence.set(name, [licensed]);
    } else {
      members.push(licensed);
    }
  }
  return [...byLicence]
    .map(([name, members]) => ({
      name,
      packages: members.toSorted(
        (a, b) =>
          collator.compare(a.name, b.name) ||
          collator.compare(a.version, b.version),
      ),
    }))
    .toSorted(
      (a, b) =>
        b.packages.length - a.packages.length ||
        collator.compare(a.name, b.name),
    );
}
