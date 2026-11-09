import { copy } from "#lib/copy.ts";

export function documentTitle(page: string): string {
  return `${page} · ${copy.adminName}`;
}
