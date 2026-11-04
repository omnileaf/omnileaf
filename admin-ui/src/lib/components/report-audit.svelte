<script lang="ts">
  import { describeChange } from "#lib/audit-change.ts";
  import ReceivedTime from "#lib/components/received-time.svelte";
  import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "#lib/components/ui/table/index.ts";
  import { copy } from "#lib/copy.ts";
  import type { AuditEntry } from "#lib/wire.ts";

  let { entries }: { entries: readonly AuditEntry[] } = $props();
</script>

<Card class="gap-2">
  <CardHeader>
    <CardTitle>{copy.audit.title}</CardTitle>
    <CardDescription>{copy.audit.hint}</CardDescription>
  </CardHeader>
  {#if entries.length === 0}
    <p class="px-5 text-small text-muted">{copy.audit.none}</p>
  {:else}
    <ul class="tablet:hidden">
      {#each entries as entry, index (index)}
        <li
          class="flex flex-col gap-1 border-be border-border px-5 py-3 last:border-0"
        >
          <span>{describeChange(entry)}</span>
          <span class="flex flex-wrap gap-x-3 text-label text-muted">
            <span>{entry.actor}</span>
            <ReceivedTime at={entry.at} />
          </span>
        </li>
      {/each}
    </ul>
    <div class="hidden tablet:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{copy.audit.columns.when}</TableHead>
            <TableHead scope="col">{copy.audit.columns.who}</TableHead>
            <TableHead scope="col">{copy.audit.columns.change}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each entries as entry, index (index)}
            <TableRow>
              <TableCell class="py-2 text-muted">
                <ReceivedTime at={entry.at} />
              </TableCell>
              <TableCell class="py-2">{entry.actor}</TableCell>
              <TableCell class="py-2">{describeChange(entry)}</TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </div>
  {/if}
</Card>
