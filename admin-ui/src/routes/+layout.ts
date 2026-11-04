import { api } from "#lib/browser-api.ts";

import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load = (async () => ({
  session: await api.session(),
})) satisfies LayoutLoad;
