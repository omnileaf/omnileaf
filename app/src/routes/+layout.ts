import { commands } from "$lib/ipc/bindings";
import { Notices } from "$lib/notices/notices.svelte";

import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async () => {
  const appInfo = await commands.appInfo();
  document.documentElement.dataset.platform = appInfo.platform;
  return { appInfo, notices: new Notices() };
};
