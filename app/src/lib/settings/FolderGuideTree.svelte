<script lang="ts">
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { EXAMPLE_FOLDER, FOLDER_INDENTS } from "./folder-guide.ts";
</script>

<ul
  aria-label={m.folder_guide_example()}
  class="mbs-sm flex flex-col rounded-card py-sm inset-ring inset-ring-border"
>
  {#each EXAMPLE_FOLDER as entry (entry.name)}
    <li class="flex px-lg py-folder-row">
      <div
        class={[
          "flex items-start gap-sm min-inline-none",
          FOLDER_INDENTS[entry.depth],
        ]}
      >
        <Icon
          name={entry.isFolder ? "folder" : "file-text"}
          class={[
            "mbs-2xs shrink-0",
            entry.isFolder ? "text-accent" : "text-muted",
          ]}
        />
        <div class="flex flex-col min-inline-none">
          <span class="text-body wrap-anywhere">{entry.name}</span>
          <span class="text-caption text-muted">{entry.readAs()}</span>
        </div>
      </div>
    </li>
  {/each}
</ul>
