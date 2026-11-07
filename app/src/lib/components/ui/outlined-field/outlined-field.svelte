<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { OUTLINED_FIELD_BOX, OUTLINED_FIELD_LABEL } from "./looks.ts";

  let {
    label,
    labelFor,
    labelClass = "bg-background",
    children,
    trailing,
  }: {
    label: string;
    labelFor: string;
    labelClass?: ClassValue;
    children: Snippet;
    trailing?: Snippet;
  } = $props();
</script>

<div data-slot="outlined-field" class={OUTLINED_FIELD_BOX}>
  <label for={labelFor} class={cn(OUTLINED_FIELD_LABEL, labelClass)}>
    {label}
  </label>
  {@render children()}
  {@render trailing?.()}
</div>
