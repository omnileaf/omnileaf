import { copy } from "#lib/copy.ts";
import { fillTemplate } from "#lib/template.ts";
import type { AuditEntry } from "#lib/wire.ts";

export function describeChange(entry: AuditEntry): string {
  const words = {
    previous: copy.status[entry.previous],
    status: copy.status[entry.status.kind],
  };
  return "issue" in entry.status
    ? fillTemplate(copy.audit.changedWithIssue, {
        ...words,
        issue: entry.status.issue,
      })
    : fillTemplate(copy.audit.changed, words);
}
