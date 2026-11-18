import { error } from "@sveltejs/kit";

import { commands } from "#lib/ipc/bindings.ts";

import type { PageLoad } from "./$types";

const NOT_FOUND = 404;

export const load: PageLoad = async ({ params }) => {
  const notes = (await commands.whatsNew()).earlier.find(
    ({ version }) => version === params.version,
  );
  if (notes === undefined) {
    error(NOT_FOUND, `no notes bundled for ${params.version}`);
  }
  return { notes };
};
