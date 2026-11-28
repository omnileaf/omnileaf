<script lang="ts">
  import { ChevronDown, FileText, Folder } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "#lib/components/ui/table/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ExampleNames from "./ExampleNames.svelte";
  import {
    ENTRY_ICONS,
    type EntryKind,
    EXAMPLE_FOLDER,
    FOLDER_INDENTS,
    NAMING_RULES,
  } from "./folder-guide.ts";

  const ICON_SIZE = 16;
  const CARD =
    "flex flex-col rounded-card border border-border bg-card px-xl py-2xs";
  const CARD_HEADING = "pbs-lg text-small font-medium";
  const RULE_ICON_TINTS = {
    folder: "text-foreground",
    file: "text-muted",
  } satisfies Record<EntryKind, string>;

  let { class: className }: { class?: ClassValue | undefined } = $props();

  const exampleId = $props.id();
  const rulesId = `${exampleId}-rules`;
</script>

<div class={["flex flex-col gap-xl wrap-break-word", className]}>
  <div class="flex flex-col gap-sm">
    <p class="text-small text-muted">{m.folder_guide_intro_desktop()}</p>
    <section aria-labelledby={exampleId} class={CARD}>
      <h2 id={exampleId} class={CARD_HEADING}>{m.folder_guide_example()}</h2>
      <Table aria-labelledby={exampleId} class="mbs-sm mbe-xs table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead
              scope="col"
              class="ps-sm text-small wrap-break-word whitespace-normal"
            >
              {m.folder_guide_name()}
            </TableHead>
            <TableHead
              scope="col"
              class="pe-sm text-small wrap-break-word whitespace-normal"
            >
              {m.folder_guide_read_as()}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each EXAMPLE_FOLDER as entry (entry.name)}
            <TableRow>
              <TableCell class="py-sm ps-sm">
                <span
                  class={[
                    "flex items-center gap-xs font-mono text-detail min-inline-none",
                    FOLDER_INDENTS[entry.depth],
                  ]}
                >
                  <ChevronDown
                    size={ICON_SIZE}
                    aria-hidden="true"
                    class={[
                      "shrink-0 text-muted",
                      !entry.isFolder && "invisible",
                    ]}
                  />
                  {#if entry.isFolder}
                    <Folder
                      size={ICON_SIZE}
                      aria-hidden="true"
                      class="shrink-0"
                    />
                  {:else}
                    <FileText
                      size={ICON_SIZE}
                      aria-hidden="true"
                      class="shrink-0 text-muted"
                    />
                  {/if}
                  <span class="truncate">{entry.name}</span>
                </span>
              </TableCell>
              <TableCell class="py-sm pe-sm wrap-break-word">
                {entry.readAs()}
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </section>
  </div>
  <section aria-labelledby={rulesId} class={["@container", CARD]}>
    <h2 id={rulesId} class={CARD_HEADING}>{m.folder_guide_rules()}</h2>
    <div
      class="mbs-sm grid grid-cols-1 gap-x-xl gap-y-sm pbe-xs naming-rules-beside:grid-cols-2"
    >
      {#each NAMING_RULES as group (group.kind)}
        {@const groupId = `${rulesId}-${group.kind}`}
        <div class="flex flex-col">
          <h3 id={groupId} class="mbe-xs text-caption font-medium text-muted">
            {group.heading()}
          </h3>
          <ul aria-labelledby={groupId} class="flex flex-col">
            {#each group.rules as rule (rule.title)}
              <li
                class="flex items-start gap-folder-rule-gap py-sm not-first:border-bs not-first:border-border"
              >
                <Icon
                  name={ENTRY_ICONS[group.kind]}
                  size={ICON_SIZE}
                  class={["mbs-2xs shrink-0", RULE_ICON_TINTS[group.kind]]}
                />
                <div class="flex flex-col gap-2xs min-inline-none">
                  <span class="text-small font-medium">{rule.title()}</span>
                  {#if rule.names.length > 0}
                    <ExampleNames
                      names={rule.names}
                      class="text-detail wrap-anywhere"
                    />
                  {/if}
                  {#if rule.note !== undefined}
                    <span class="text-small text-muted">{rule.note()}</span>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </section>
</div>
