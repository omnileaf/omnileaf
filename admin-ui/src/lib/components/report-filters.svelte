<script lang="ts">
  import Search from "@lucide/svelte/icons/search";

  import FilterSelect from "#lib/components/filter-select.svelte";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { Label } from "#lib/components/ui/label/index.ts";
  import { copy } from "#lib/copy.ts";
  import type { FilterOptions } from "#lib/filter-options.ts";
  import { changeFilter, type FilterPart } from "#lib/reports-query.ts";
  import type { ReportFilter } from "#lib/reports.ts";
  import { STATUS_KINDS } from "#lib/wire.ts";

  let {
    filter,
    options,
    onChange,
    onClear,
  }: {
    filter: ReportFilter;
    options: FilterOptions;
    onChange: (next: ReportFilter) => void;
    onClear?: (() => void) | undefined;
  } = $props();

  const statusChoices = STATUS_KINDS.map((kind) => ({
    value: kind,
    label: copy.status[kind],
  }));

  const asChoices = (values: readonly string[]) =>
    values.map((value) => ({ value, label: value }));

  const change = (part: FilterPart) => (value: string) => {
    onChange(changeFilter(filter, part, value));
  };

  function searched(event: Event & { currentTarget: HTMLInputElement }): void {
    change("search")(event.currentTarget.value);
  }
</script>

<search
  aria-label={copy.reports.filters}
  class="flex flex-col gap-3 tablet:flex-row tablet:items-end"
>
  <div class="flex flex-1 flex-col gap-1.5 min-inline-0">
    <Label for="report-search">{copy.reports.searchLabel}</Label>
    <div class="relative flex items-center">
      <Search
        class="pointer-events-none absolute inset-s-3 text-muted block-4 inline-4"
      />
      <Input
        id="report-search"
        type="search"
        class="ps-9"
        placeholder={copy.reports.searchPlaceholder}
        value={filter.search ?? ""}
        oninput={searched}
      />
    </div>
  </div>
  <div class="grid grid-cols-2 gap-3 tablet:flex tablet:items-end">
    <FilterSelect
      id="report-status"
      label={copy.reports.statusLabel}
      allLabel={copy.reports.allStatuses}
      value={filter.status ?? ""}
      choices={statusChoices}
      onSelect={change("status")}
    />
    <FilterSelect
      id="report-platform"
      label={copy.reports.platformLabel}
      allLabel={copy.reports.allPlatforms}
      value={filter.platform ?? ""}
      choices={asChoices(options.platforms)}
      onSelect={change("platform")}
    />
    <FilterSelect
      id="report-version"
      label={copy.reports.versionLabel}
      allLabel={copy.reports.allVersions}
      value={filter.version ?? ""}
      choices={asChoices(options.versions)}
      onSelect={change("version")}
    />
    {#if onClear !== undefined}
      <Button variant="outline" onclick={onClear}>
        {copy.reports.clearFilters}
      </Button>
    {/if}
  </div>
</search>
