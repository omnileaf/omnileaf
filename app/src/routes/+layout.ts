import { commands } from "$lib/ipc/bindings";
import {
  browserLanguageStore,
  markLanguage,
  useChosenLanguage,
} from "$lib/language/language";

import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async () => {
  useChosenLanguage(browserLanguageStore());
  markLanguage(document.documentElement);
  const appInfo = await commands.appInfo();
  document.documentElement.dataset.platform = appInfo.platform;
  return { appInfo };
};
