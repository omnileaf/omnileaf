import { loadLicensedPackages } from "#lib/licences/shipped.ts";

import type { PageLoad } from "./$types";

export const load: PageLoad = async () => ({
  packages: await loadLicensedPackages(),
});
