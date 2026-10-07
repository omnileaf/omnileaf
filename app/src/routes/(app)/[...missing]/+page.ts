import { error } from "@sveltejs/kit";

import type { PageLoad } from "./$types";

/** Sends an address no page claims to the app's own problem screen, which only routes inside this group reach. */
export const load: PageLoad = () => {
  error(404, "Not Found");
};
