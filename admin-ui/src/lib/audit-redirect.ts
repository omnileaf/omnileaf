import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";

import { pathSegment } from "#lib/path-segment.ts";

const TEMPORARY_REDIRECT = 307;

export function redirectToReport(code: string): never {
  redirect(
    TEMPORARY_REDIRECT,
    resolve("/reports/[code]", { code: pathSegment(code) }),
  );
}
