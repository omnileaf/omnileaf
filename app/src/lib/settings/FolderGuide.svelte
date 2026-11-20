<script lang="ts">
  import { ChevronDown, FileText, Folder } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "#lib/components/ui/table/index.ts";
  import { androidListLook } from "#lib/settings/android-list-look.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    EXAMPLE_FOLDER,
    FOLDER_INDENTS,
    FOLDER_RULES,
  } from "./folder-guide.ts";
  import FolderGuideTree from "./FolderGuideTree.svelte";

  const ICON_SIZE = 16;
  const ANDROID_LOOK = {
    page: "",
    intro: "pbe-sm text-body",
    rules: "flex flex-col",
    rulesHeading: "pbs-xl pbe-sm text-body font-medium",
    rulesList: `flex flex-col gap-md ${ROW_SUBTITLE_TYPE}`,
  };
  const TABLE_LOOK = {
    page: "gap-pane-gap",
    intro: "text-footnote text-muted",
    rules: "flex flex-col gap-sm",
    rulesHeading: "text-body font-medium",
    rulesList: "flex list-disc flex-col gap-xs ps-xl text-small",
  } satisfies typeof ANDROID_LOOK;

  let { class: className }: { class?: ClassValue } = $props();

  const android = androidListLook();
  const exampleId = $props.id();
  const rulesId = `${exampleId}-rules`;
  const look = $derived(android.isOn ? ANDROID_LOOK : TABLE_LOOK);
</script>

<div class={["flex flex-col wrap-break-word", look.page, className]}>
  <p class={look.intro}>
    {m.folder_guide_intro()}
  </p>
  {#if android.isOn}
    <FolderGuideTree />
  {:else}
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
                <TableCell class="py-sm wrap-break-word"
                  >{entry.readAs()}</TableCell
                >
              </TableRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    </section>
  {/if}
  <section class={look.rules}>
    <h2 id={rulesId} class={look.rulesHeading}>
      {m.folder_guide_rules()}
    </h2>
    <ul aria-labelledby={rulesId} class={look.rulesList}>
      {#each FOLDER_RULES as rule (rule)}
        <li>{rule()}</li>
      {/each}
    </ul>
  </section>
</div>
