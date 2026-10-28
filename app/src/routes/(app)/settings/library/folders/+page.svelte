<script lang="ts">
  import { ChevronDown, FileText, Folder } from "@lucide/svelte";

  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "#lib/components/ui/table/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    EXAMPLE_FOLDER,
    FOLDER_RULES,
    type FolderDepth,
  } from "#lib/settings/folder-guide.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  const ICON_SIZE = 16;
  const INDENTS = {
    0: "",
    1: "ps-folder-depth-1",
    2: "ps-folder-depth-2",
    3: "ps-folder-depth-3",
  } satisfies Record<FolderDepth, string>;

  const exampleId = $props.id();
  const rulesId = `${exampleId}-rules`;
</script>

<SectionHeading
  title={m.folder_guide_title()}
  parent={{ route: "/(app)/settings/library", title: m.library_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-pane-gap wrap-break-word">
  <p class="text-footnote text-muted">{m.folder_guide_intro()}</p>
  <section aria-labelledby={exampleId} class="flex flex-col gap-sm">
    <h2 id={exampleId} class="text-body font-medium">
      {m.folder_guide_example()}
    </h2>
    <div class="overflow-x-auto rounded-card border border-border">
      <Table aria-labelledby={exampleId} class="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead scope="col" class="wrap-break-word whitespace-normal"
              >{m.folder_guide_name()}</TableHead
            >
            <TableHead scope="col" class="wrap-break-word whitespace-normal"
              >{m.folder_guide_read_as()}</TableHead
            >
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each EXAMPLE_FOLDER as entry (entry.name)}
            <TableRow>
              <TableCell class="py-sm">
                <span
                  class={[
                    "flex items-center gap-xs font-mono text-detail min-inline-none",
                    INDENTS[entry.depth],
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
              <TableCell class="py-sm wrap-break-word"
                >{entry.readAs()}</TableCell
              >
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </div>
  </section>
  <section class="flex flex-col gap-sm">
    <h2 id={rulesId} class="text-body font-medium">
      {m.folder_guide_rules()}
    </h2>
    <ul
      aria-labelledby={rulesId}
      class="flex list-disc flex-col gap-xs ps-xl text-small"
    >
      {#each FOLDER_RULES as rule (rule)}
        <li>{rule()}</li>
      {/each}
    </ul>
  </section>
</div>
