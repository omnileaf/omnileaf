<script lang="ts">
  import {
    ROW_FOCUS_RING,
    ROW_SUBTITLE_TYPE,
  } from "#lib/components/ui/item/looks.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";

  import {
    SHEET_ROW_TITLE,
    SHEET_SWITCH_ROW,
    SHEET_SWITCH_WORDS,
  } from "./sheet-field-look.ts";

  let {
    label,
    description,
    isOn,
    onToggle,
  }: {
    label: string;
    description: string;
    isOn: boolean;
    onToggle: () => void;
  } = $props();

  const id = $props.id();
</script>

<div class={SHEET_SWITCH_ROW}>
  <span class={SHEET_SWITCH_WORDS}>
    <span id="{id}-label" class={SHEET_ROW_TITLE}>{label}</span>
    <span id="{id}-description" class={[ROW_SUBTITLE_TYPE, "text-muted"]}>
      {description}
    </span>
  </span>
  <Switch
    bind:checked={() => isOn, onToggle}
    aria-labelledby="{id}-label"
    aria-describedby="{id}-description"
    class={["native-target shrink-0 rounded-full", ROW_FOCUS_RING]}
  />
</div>
