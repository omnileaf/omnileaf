import { error } from "@sveltejs/kit";

import { loadLicensedPackages } from "#lib/licences/shipped.ts";

import type { PageLoad } from "./$types";

const NOT_FOUND = 404;

export const load: PageLoad = async ({ params }) => {
  const licensed = (await loadLicensedPackages()).find(
    ({ key }) => key === params.package,
  );
  if (licensed === undefined) {
    error(NOT_FOUND, `no licence for ${params.package}`);
  }
  return { licensed };
};
