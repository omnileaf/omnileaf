<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import {
    Item,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    ENTRY_ICONS,
    NAME_SEPARATOR,
    NAMING_RULES,
    takesThreeLines,
  } from "./folder-guide.ts";
  import {
    ENTRY_TINTS,
    type NativeGuideLook,
    RULE_NAMES_TYPE,
  } from "./folder-guide-looks.ts";
  import FolderGuideTree from "./FolderGuideTree.svelte";

  let {
    look,
    class: className,
  }: { look: NativeGuideLook; class?: ClassValue | undefined } = $props();

  const headingId = $props.id();
</script>

<div
  data-ground="grouped"
  class={["flex flex-col wrap-break-word", look.page, className]}
>
  <p class={look.intro}>{m.folder_guide_intro()}</p>
  <FolderGuideTree {look} />
  <h2 class={look.rulesHeading}>{m.folder_guide_rules()}</h2>
  {#each NAMING_RULES as group (group.kind)}
    {@const groupId = `${headingId}-${group.kind}`}
    <div class="flex flex-col">
      <h3 id={groupId} class={look.groupHeading}>{group.heading()}</h3>
      <ul aria-labelledby={groupId} class={look.rules}>
        {#each group.rules as rule (rule.title)}
          <li>
            <Item
              look="row-static"
              class={takesThreeLines(rule) ? look.threeLineRow : undefined}
            >
              <ItemMedia class={[look.lead, ENTRY_TINTS[group.kind]]}>
                <Icon name={ENTRY_ICONS[group.kind]} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{rule.title()}</ItemTitle>
                {#if rule.names.length > 0}
                  <ItemDescription>
                    <code translate="no" class={RULE_NAMES_TYPE}>
                      {rule.names.join(NAME_SEPARATOR)}
                    </code>
                  </ItemDescription>
                {/if}
                {#if rule.note !== undefined}
                  <ItemDescription>{rule.note()}</ItemDescription>
                {/if}
              </ItemContent>
            </Item>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</div>
