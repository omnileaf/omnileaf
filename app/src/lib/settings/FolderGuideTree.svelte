<script lang="ts">
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    ENTRY_ICONS,
    EXAMPLE_FOLDER,
    FOLDER_INDENTS,
    kindOf,
  } from "./folder-guide.ts";
  import {
    ENTRY_TINTS,
    type NativeGuideLook,
    TREE_READING_TYPE,
  } from "./folder-guide-looks.ts";

  let { look }: { look: NativeGuideLook } = $props();
</script>

<ul aria-label={m.folder_guide_example()} class={["flex flex-col", look.tree]}>
  {#each EXAMPLE_FOLDER as entry (entry.name)}
    <li class="flex px-lg py-folder-row">
      <div
        class={[
          "grid flex-1 grid-cols-details items-start gap-x-sm min-inline-none",
          FOLDER_INDENTS[entry.depth],
        ]}
      >
        <span class="flex shrink-0 inline-native-icon">
          <Icon
            name={ENTRY_ICONS[kindOf(entry)]}
            size={look.treeIconSize}
            class={["mbs-2xs", ENTRY_TINTS[kindOf(entry)]]}
          />
        </span>
        <span
          class="text-native-row-title/native-row-title tracking-native-row-title wrap-anywhere"
        >
          {entry.name}
        </span>
        <span class={["col-start-2", TREE_READING_TYPE]}>
          {entry.readAs()}
        </span>
      </div>
    </li>
  {/each}
</ul>
