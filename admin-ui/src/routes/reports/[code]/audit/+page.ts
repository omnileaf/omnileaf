import { redirectToReport } from "#lib/audit-redirect.ts";

import type { PageLoad } from "./$types";

export const load = (({ params }) => {
  redirectToReport(params.code);
}) satisfies PageLoad;
