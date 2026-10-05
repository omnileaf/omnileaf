/** A licence's text, named by its SPDX id, or by its file name where a package ships several. */
export interface LicenceText {
  readonly licence: string;
  readonly text: string;
}

/** A shipped package, its declared licence and the indexes of its texts in the catalogue. */
export interface CataloguedPackage {
  readonly name: string;
  readonly version: string;
  readonly licence: string;
  readonly texts: readonly number[];
}

export interface LicenceCatalogue {
  readonly packages: readonly CataloguedPackage[];
  readonly texts: readonly LicenceText[];
}
