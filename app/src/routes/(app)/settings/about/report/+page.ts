import { commands } from "#lib/ipc/bindings.ts";
import { PROBLEM_REPORT } from "#lib/problem-report/problem-report.ts";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ depends }) => {
  depends(PROBLEM_REPORT);
  return { report: await commands.problemReport() };
};
