import { type LicensedPackage, licensedPackages } from "./licences.ts";

/** Loads the licence catalogues on first use, so their texts stay out of the app's first download. */
export async function loadLicensedPackages(): Promise<LicensedPackage[]> {
  const [rust, javascript] = await Promise.all([
    import("./rust.json"),
    import("./javascript.json"),
  ]);
  return licensedPackages({
    rust: rust.default,
    javascript: javascript.default,
  });
}
