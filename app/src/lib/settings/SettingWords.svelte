<script lang="ts" module>
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";

  import { LIST_LINE, LIST_TITLE } from "./grouped-rows-look";

  export type WordsLook = "todays" | "android" | "grouped";

  const WORDS_LOOKS = {
    todays: {
      words: "flex flex-1 flex-col gap-2xs min-inline-none",
      label: "font-medium expanded:font-semibold",
      description: "text-muted text-detail",
    },
    android: {
      words: "flex flex-1 flex-col min-inline-none",
      label: "",
      description: `text-muted ${ROW_SUBTITLE_TYPE}`,
    },
    grouped: {
      words: "flex flex-1 flex-col min-inline-none",
      label: LIST_TITLE,
      description: LIST_LINE,
    },
  } as const satisfies Record<WordsLook, object>;
</script>

<script lang="ts">
  interface Props {
    readonly id: string;
    readonly label: string;
    readonly description: string | undefined;
    readonly look?: WordsLook;
  }

  let { id, label, description, look = "todays" }: Props = $props();

  const classes = $derived(WORDS_LOOKS[look]);
</script>

<span class={classes.words}>
  <span id="{id}-label" class={classes.label}>{label}</span>
  {#if description !== undefined}
    <span id="{id}-description" class={classes.description}>{description}</span>
  {/if}
</span>
