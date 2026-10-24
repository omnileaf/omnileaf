import { error } from "@sveltejs/kit";

import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
  if (import.meta.env.DEV && import.meta.env.VITE_KIT_PAGE === "on") {
    const { default: KitPage } = await import("#lib/kit-page/KitPage.svelte");
    return { KitPage };
  }
  error(404, "Not Found");
};
