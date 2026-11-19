import { error } from "@sveltejs/kit";

import { commands } from "#lib/ipc/bindings.ts";

import type { PageLoad } from "./$types";

const NOT_FOUND = 404;

export const load: PageLoad = async () => {
  const { installed, earlier } = await commands.whatsNew();
  if (installed === null) {
    error(NOT_FOUND, "no notes bundled for the installed version");
  }
  return { installed, earlier };
};
