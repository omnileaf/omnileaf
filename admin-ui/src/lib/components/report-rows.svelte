<script lang="ts">
  import ReportCell from "#lib/components/report-cell.svelte";
  import ReportCodeLink from "#lib/components/report-code-link.svelte";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "#lib/components/ui/table/index.ts";
  import { copy } from "#lib/copy.ts";
  import {
    REPORT_COLUMN_HEADERS,
    type ReportColumn,
  } from "#lib/report-columns.ts";
  import type { Listed } from "#lib/wire.ts";

  let {
    reports,
    columns,
  }: {
    reports: readonly Listed[];
    columns: readonly ReportColumn[];
  } = $props();

  const detailColumns = $derived(
    columns.filter((column) => column !== "status"),
  );
</script>

<ul class="tablet:hidden">
  {#each reports as report (report.code)}
    <li
      class="flex flex-col gap-1 border-be border-border px-4 py-1 last:border-0"
    >
      <div class="flex items-center justify-between gap-3">
        <ReportCodeLink {report} />
        {#if columns.includes("status")}
          <ReportCell {report} column="status" />
        {/if}
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 pbe-2 text-label text-muted">
        {#each detailColumns as column (column)}
          <span><ReportCell {report} {column} /></span>
        {/each}
      </div>
    </li>
  {/each}
</ul>

<div class="hidden tablet:block">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead scope="col">{copy.reportColumns.code}</TableHead>
        {#each columns as column (column)}
          <TableHead scope="col">{REPORT_COLUMN_HEADERS[column]}</TableHead>
        {/each}
      </TableRow>
    </TableHeader>
    <TableBody>
      {#each reports as report (report.code)}
        <TableRow>
          <TableCell class="py-2"><ReportCodeLink {report} /></TableCell>
          {#each columns as column (column)}
            <TableCell class="py-2 text-muted">
              <ReportCell {report} {column} />
            </TableCell>
          {/each}
        </TableRow>
      {/each}
    </TableBody>
  </Table>
</div>
