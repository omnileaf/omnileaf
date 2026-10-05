import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
  const { isFirstLaunch } = await parent();
  if (!isFirstLaunch) {
    redirect(307, resolve("/"));
  }
};
