import { loadLicensedPackages } from "$lib/licences/shipped";

import type { PageLoad } from "./$types";

export const load: PageLoad = async () => ({
  packages: await loadLicensedPackages(),
});
