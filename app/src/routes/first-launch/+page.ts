import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";
import { SECTION_ROUTE_IDS } from "#lib/navigation/sections.ts";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
  const { isFirstLaunch } = await parent();
  if (!isFirstLaunch) {
    redirect(307, resolve(SECTION_ROUTE_IDS.library));
  }
};
