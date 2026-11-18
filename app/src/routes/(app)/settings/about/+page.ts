import { commands } from "#lib/ipc/bindings.ts";

import type { PageLoad } from "./$types";

export const load: PageLoad = async () => ({
  whatsNew: await commands.whatsNew(),
});
