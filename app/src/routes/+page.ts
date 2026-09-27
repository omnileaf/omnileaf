import { commands } from "$lib/ipc/bindings";

import type { PageLoad } from "./$types";

export const load: PageLoad = async () => ({
  appInfo: await commands.appInfo(),
});
