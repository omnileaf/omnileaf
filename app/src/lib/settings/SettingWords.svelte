<script lang="ts">
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";

  interface Props {
    readonly id: string;
    readonly label: string;
    readonly description: string | undefined;
    readonly isAndroidPhone?: boolean;
  }

  let { id, label, description, isAndroidPhone = false }: Props = $props();
</script>

<span
  class={["flex flex-1 flex-col min-inline-none", !isAndroidPhone && "gap-2xs"]}
>
  <span
    id="{id}-label"
    class={isAndroidPhone ? "" : "font-medium expanded:font-semibold"}
    >{label}</span
  >
  {#if description !== undefined}
    <span
      id="{id}-description"
      class={["text-muted", isAndroidPhone ? ROW_SUBTITLE_TYPE : "text-detail"]}
      >{description}</span
    >
  {/if}
</span>
